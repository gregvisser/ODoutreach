import { describe, expect, it } from "vitest";

import {
  assertActiveMailboxLimit,
  assertPrimaryRequiresActive,
  DEFAULT_MAILBOX_DAILY_SEND_CAP,
  isMailboxSendingEligible,
  isUnderDailySendCap,
  MAX_ACTIVE_MAILBOXES_PER_CLIENT,
} from "./mailbox-identities";

describe("assertActiveMailboxLimit", () => {
  it("throws when activating a sixth active mailbox", () => {
    expect(() => assertActiveMailboxLimit(MAX_ACTIVE_MAILBOXES_PER_CLIENT, true)).toThrow(
      /at most 5 active mailboxes/i,
    );
  });

  it("allows when below cap", () => {
    expect(() => assertActiveMailboxLimit(MAX_ACTIVE_MAILBOXES_PER_CLIENT - 1, true)).not.toThrow();
  });
});

describe("assertPrimaryRequiresActive", () => {
  it("throws when primary but inactive", () => {
    expect(() => assertPrimaryRequiresActive(true, false)).toThrow(/primary mailbox must be active/i);
  });
});

describe("default daily cap constant", () => {
  it("is 30", () => {
    expect(DEFAULT_MAILBOX_DAILY_SEND_CAP).toBe(30);
  });
});

describe("isMailboxSendingEligible", () => {
  const base = {
    isActive: true,
    connectionStatus: "CONNECTED" as const,
    canSend: true,
    isSendingEnabled: true,
    dailySendCap: 30,
    emailsSentToday: 0,
    dailyWindowResetAt: new Date("2026-04-18T00:00:00.000Z"),
  };

  it("is false when inactive", () => {
    expect(isMailboxSendingEligible({ ...base, isActive: false }, new Date("2026-04-17T12:00:00.000Z"))).toBe(
      false,
    );
  });

  it("is false when not connected", () => {
    expect(
      isMailboxSendingEligible({ ...base, connectionStatus: "DRAFT" }, new Date("2026-04-17T12:00:00.000Z")),
    ).toBe(false);
  });

  it("is false when sending disabled", () => {
    expect(
      isMailboxSendingEligible(
        { ...base, isSendingEnabled: false },
        new Date("2026-04-17T12:00:00.000Z"),
      ),
    ).toBe(false);
  });

  it("is false when over daily cap inside window", () => {
    expect(
      isMailboxSendingEligible(
        {
          ...base,
          emailsSentToday: 30,
          dailyWindowResetAt: new Date("2026-04-18T00:00:00.000Z"),
        },
        new Date("2026-04-17T12:00:00.000Z"),
      ),
    ).toBe(false);
  });

  it("treats counter as stale after reset boundary for gating", () => {
    expect(
      isMailboxSendingEligible(
        {
          ...base,
          emailsSentToday: 30,
          dailyWindowResetAt: new Date("2026-04-17T00:00:00.000Z"),
        },
        new Date("2026-04-17T12:00:00.000Z"),
      ),
    ).toBe(true);
  });
});

describe("isUnderDailySendCap", () => {
  it("matches cap default when dailySendCap omitted in logic", () => {
    const input = {
      isActive: true,
      connectionStatus: "CONNECTED" as const,
      canSend: true,
      isSendingEnabled: true,
      dailySendCap: 30,
      emailsSentToday: 29,
      dailyWindowResetAt: new Date("2026-04-18T00:00:00.000Z"),
    };
    expect(isUnderDailySendCap(input, new Date("2026-04-17T12:00:00.000Z"))).toBe(true);
    expect(
      isUnderDailySendCap(
        { ...input, emailsSentToday: 30 },
        new Date("2026-04-17T12:00:00.000Z"),
      ),
    ).toBe(false);
  });
});
