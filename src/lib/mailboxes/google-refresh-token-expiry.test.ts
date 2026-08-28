import { describe, expect, it } from "vitest";

import {
  GOOGLE_RECONNECT_WARN_WHEN_DAYS_REMAINING_AT_MOST,
  GOOGLE_REFRESH_TOKEN_TTL_MS,
  googleRefreshTokenDeadline,
  resolveGoogleReconnectCountdown,
} from "./google-refresh-token-expiry";

/**
 * A FIXED consent instant. The whole point of this module is that the countdown
 * is arithmetic, so every assertion below is driven from this date and an
 * explicit `now` — never from the wall clock.
 */
const CONNECTED_AT = new Date("2026-08-28T09:00:00.000Z");

/** `now`, expressed as whole days after consent. */
function daysAfterConsent(days: number): Date {
  return new Date(CONNECTED_AT.getTime() + days * 86_400_000);
}

const CONNECTED_GOOGLE = {
  provider: "GOOGLE" as const,
  connectionStatus: "CONNECTED",
  connectedAt: CONNECTED_AT,
};

describe("googleRefreshTokenDeadline", () => {
  it("is seven days after consent", () => {
    expect(googleRefreshTokenDeadline(CONNECTED_AT)).toEqual(
      new Date("2026-09-04T09:00:00.000Z"),
    );
  });

  it("does not mutate the date it was given", () => {
    googleRefreshTokenDeadline(CONNECTED_AT);
    expect(CONNECTED_AT.toISOString()).toBe("2026-08-28T09:00:00.000Z");
  });

  it("agrees with the exported time-to-live", () => {
    expect(GOOGLE_REFRESH_TOKEN_TTL_MS).toBe(7 * 86_400_000);
  });
});

describe("resolveGoogleReconnectCountdown — the day count", () => {
  // The sequence the brief asked to see fail first: 7, 5, 1, 0 and overdue.
  it("reports seven days left at the moment of consent", () => {
    const countdown = resolveGoogleReconnectCountdown(CONNECTED_GOOGLE, CONNECTED_AT);
    expect(countdown?.daysRemaining).toBe(7);
    expect(countdown?.status).toBe("ok");
  });

  it("reports five days left two days after consent", () => {
    const countdown = resolveGoogleReconnectCountdown(CONNECTED_GOOGLE, daysAfterConsent(2));
    expect(countdown?.daysRemaining).toBe(5);
    expect(countdown?.status).toBe("ok");
  });

  it("reports one day left six days after consent", () => {
    const countdown = resolveGoogleReconnectCountdown(CONNECTED_GOOGLE, daysAfterConsent(6));
    expect(countdown?.daysRemaining).toBe(1);
    expect(countdown?.status).toBe("due");
  });

  it("reports zero days left inside the final day", () => {
    const countdown = resolveGoogleReconnectCountdown(
      CONNECTED_GOOGLE,
      daysAfterConsent(6.5),
    );
    expect(countdown?.daysRemaining).toBe(0);
    expect(countdown?.status).toBe("due");
    expect(countdown?.label).toContain("less than a day");
  });

  it("is overdue on the exact deadline, because the token is gone by then", () => {
    const countdown = resolveGoogleReconnectCountdown(CONNECTED_GOOGLE, daysAfterConsent(7));
    expect(countdown?.status).toBe("overdue");
    expect(countdown?.daysRemaining).toBe(0);
  });

  it("stays overdue long after the deadline and never wraps back to positive", () => {
    const countdown = resolveGoogleReconnectCountdown(CONNECTED_GOOGLE, daysAfterConsent(30));
    expect(countdown?.status).toBe("overdue");
    expect(countdown?.daysRemaining).toBeLessThan(0);
    expect(countdown?.label).toContain("Reconnect needed");
  });

  it("rounds down, so a partly-elapsed day is never counted as still available", () => {
    // 1.9 days elapsed leaves 5.1 — reporting "5" is honest, reporting "6" is not.
    const countdown = resolveGoogleReconnectCountdown(CONNECTED_GOOGLE, daysAfterConsent(1.9));
    expect(countdown?.daysRemaining).toBe(5);
  });
});

describe("resolveGoogleReconnectCountdown — when the day-five alarm should sound", () => {
  it("does not warn while more than two days remain", () => {
    const countdown = resolveGoogleReconnectCountdown(CONNECTED_GOOGLE, daysAfterConsent(4));
    expect(countdown?.status).toBe("ok");
    expect(countdown?.needsAttention).toBe(false);
  });

  it("warns from day five, when two days remain", () => {
    const countdown = resolveGoogleReconnectCountdown(CONNECTED_GOOGLE, daysAfterConsent(5));
    expect(countdown?.daysRemaining).toBe(2);
    expect(countdown?.status).toBe("due");
    expect(countdown?.needsAttention).toBe(true);
  });

  it("keeps warning every day after that until it is reconnected", () => {
    for (const day of [5, 6, 6.99, 7, 9]) {
      const countdown = resolveGoogleReconnectCountdown(CONNECTED_GOOGLE, daysAfterConsent(day));
      expect(countdown?.needsAttention).toBe(true);
    }
  });

  it("uses the documented threshold rather than a second copy of the number", () => {
    expect(GOOGLE_RECONNECT_WARN_WHEN_DAYS_REMAINING_AT_MOST).toBe(2);
  });
});

describe("resolveGoogleReconnectCountdown — rows with no Google clock", () => {
  it("says nothing at all about a Microsoft mailbox", () => {
    expect(
      resolveGoogleReconnectCountdown(
        { provider: "MICROSOFT", connectionStatus: "CONNECTED", connectedAt: CONNECTED_AT },
        daysAfterConsent(30),
      ),
    ).toBeNull();
  });

  it("says nothing about a Google mailbox that was never connected", () => {
    for (const connectionStatus of ["DRAFT", "PENDING_CONNECTION", "DISCONNECTED", "CONNECTION_ERROR"]) {
      expect(
        resolveGoogleReconnectCountdown(
          { provider: "GOOGLE", connectionStatus, connectedAt: null },
          daysAfterConsent(1),
        ),
      ).toBeNull();
    }
  });

  it("fails toward attention when a connected Google row has no consent date", () => {
    // This row cannot be proven fresh, and the callback always writes
    // `connectedAt`, so a missing one is a row we should look at rather than
    // quietly assume is healthy.
    const countdown = resolveGoogleReconnectCountdown(
      { provider: "GOOGLE", connectionStatus: "CONNECTED", connectedAt: null },
      daysAfterConsent(1),
    );
    expect(countdown?.status).toBe("unknown");
    expect(countdown?.needsAttention).toBe(true);
    expect(countdown?.daysRemaining).toBeNull();
    expect(countdown?.deadline).toBeNull();
  });
});

describe("resolveGoogleReconnectCountdown — the words an operator reads", () => {
  it("names the deadline as a plain date, not a timestamp", () => {
    const countdown = resolveGoogleReconnectCountdown(CONNECTED_GOOGLE, daysAfterConsent(2));
    expect(countdown?.label).toBe("Google — reconnect by 4 Sep 2026, 5 days left");
  });

  it("uses the singular for the last whole day", () => {
    const countdown = resolveGoogleReconnectCountdown(CONNECTED_GOOGLE, daysAfterConsent(6));
    expect(countdown?.label).toBe("Google — reconnect by 4 Sep 2026, 1 day left");
  });

  it("says what to do, not what expired, once the deadline has passed", () => {
    const countdown = resolveGoogleReconnectCountdown(CONNECTED_GOOGLE, daysAfterConsent(8));
    expect(countdown?.label).toBe("Reconnect needed — this Google login expired on 4 Sep 2026");
  });

  it("formats the deadline in UTC so a browser timezone cannot shift the date", () => {
    // Consent late in the UK evening: the deadline instant is 23:30Z, which is
    // the NEXT day in any timezone east of London. The label must not move.
    const countdown = resolveGoogleReconnectCountdown(
      {
        provider: "GOOGLE",
        connectionStatus: "CONNECTED",
        connectedAt: new Date("2026-08-28T23:30:00.000Z"),
      },
      new Date("2026-08-29T09:00:00.000Z"),
    );
    expect(countdown?.label).toContain("4 Sep 2026");
  });
});
