import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildOpenTrackingPixelUrlForClient,
  decideClientOpenTracking,
  TRACKING_DNS_MAX_AGE_DAYS,
  type ClientOpenTrackingFields,
} from "./client-open-tracking";

/**
 * The promise these tests hold in place: open tracking is OFF for a client
 * until that client has been deliberately opted in, and it can only be opted
 * in once their own DNS is verified. Before this module existed the pixel was
 * on for everybody unless someone remembered to type `off` into the Azure
 * portal — a written customer promise resting on one string in a text box.
 */

const VERIFIED_DOMAIN = {
  outreachLinkDomain: "go.paratus365.com",
  outreachLinkDomainVerifiedAt: new Date("2026-08-01T00:00:00.000Z"),
};

const OPTED_IN_AT = new Date("2026-08-20T00:00:00.000Z");

/**
 * The default fixture carries a FRESH DNS verification, so every test above the
 * email-auth block is measuring the thing it is named after rather than being
 * held off by a gate it never mentions. The tests that care about that gate set
 * it explicitly.
 */
function client(overrides: Partial<ClientOpenTrackingFields> = {}): ClientOpenTrackingFields {
  return {
    outreachLinkDomain: null,
    outreachLinkDomainVerifiedAt: null,
    openTrackingEnabledAt: null,
    trackingDnsVerifiedAt: new Date(),
    ...overrides,
  };
}

describe("decideClientOpenTracking", () => {
  const prevPixel = process.env.OPEN_TRACKING_PIXEL;

  beforeEach(() => {
    // Unset — the worst case. Nothing in the environment is defending the
    // customer here, so only the per-client setting can.
    delete process.env.OPEN_TRACKING_PIXEL;
  });

  afterEach(() => {
    if (prevPixel === undefined) delete process.env.OPEN_TRACKING_PIXEL;
    else process.env.OPEN_TRACKING_PIXEL = prevPixel;
  });

  it("is OFF for a brand-new client even with a verified link domain", () => {
    const decision = decideClientOpenTracking(client(VERIFIED_DOMAIN));
    expect(decision.enabled).toBe(false);
    expect(decision).toMatchObject({ reason: "CLIENT_NOT_OPTED_IN" });
  });

  it("emits NO pixel URL for a client that has not opted in", () => {
    expect(
      buildOpenTrackingPixelUrlForClient("corr-123", client(VERIFIED_DOMAIN)),
    ).toBeNull();
  });

  it("is OFF for a client with no link domain and no opt-in", () => {
    const decision = decideClientOpenTracking(client());
    expect(decision.enabled).toBe(false);
    expect(decision).toMatchObject({ reason: "CLIENT_NOT_OPTED_IN" });
  });

  it("is ON only when the client opted in AND their domain is verified", () => {
    const decision = decideClientOpenTracking(
      client({ ...VERIFIED_DOMAIN, openTrackingEnabledAt: OPTED_IN_AT }),
    );
    expect(decision).toEqual({ enabled: true, baseUrl: "https://go.paratus365.com" });
  });

  it("serves the pixel from the client's OWN domain, never the app domain", () => {
    expect(
      buildOpenTrackingPixelUrlForClient(
        "corr-123",
        client({ ...VERIFIED_DOMAIN, openTrackingEnabledAt: OPTED_IN_AT }),
      ),
    ).toBe("https://go.paratus365.com/api/track/open/corr-123");
  });

  it("refuses an opt-in whose link domain was never verified", () => {
    const decision = decideClientOpenTracking(
      client({
        outreachLinkDomain: "go.paratus365.com",
        outreachLinkDomainVerifiedAt: null,
        openTrackingEnabledAt: OPTED_IN_AT,
      }),
    );
    expect(decision.enabled).toBe(false);
    expect(decision).toMatchObject({ reason: "LINK_DOMAIN_NOT_VERIFIED" });
  });

  it("refuses an opt-in whose link domain was cleared after opting in", () => {
    const decision = decideClientOpenTracking(
      client({
        outreachLinkDomain: null,
        outreachLinkDomainVerifiedAt: null,
        openTrackingEnabledAt: OPTED_IN_AT,
      }),
    );
    expect(decision.enabled).toBe(false);
    expect(decision).toMatchObject({ reason: "LINK_DOMAIN_NOT_VERIFIED" });
  });

  it("emits no pixel URL when the correlation id is blank", () => {
    const ready = client({ ...VERIFIED_DOMAIN, openTrackingEnabledAt: OPTED_IN_AT });
    expect(buildOpenTrackingPixelUrlForClient("   ", ready)).toBeNull();
    expect(buildOpenTrackingPixelUrlForClient("", ready)).toBeNull();
  });

  it("percent-encodes the correlation id", () => {
    expect(
      buildOpenTrackingPixelUrlForClient(
        "a/b c",
        client({ ...VERIFIED_DOMAIN, openTrackingEnabledAt: OPTED_IN_AT }),
      ),
    ).toBe("https://go.paratus365.com/api/track/open/a%2Fb%20c");
  });

  describe("the global kill switch is a backstop, never the mechanism", () => {
    const ready = () => client({ ...VERIFIED_DOMAIN, openTrackingEnabledAt: OPTED_IN_AT });

    it.each(["off", "OFF", " off ", "false", "0", "no", "disabled"])(
      "OPEN_TRACKING_PIXEL=%j overrides even an opted-in, verified client",
      (value) => {
        process.env.OPEN_TRACKING_PIXEL = value;
        const decision = decideClientOpenTracking(ready());
        expect(decision.enabled).toBe(false);
        expect(decision).toMatchObject({ reason: "GLOBAL_KILL_SWITCH" });
        expect(buildOpenTrackingPixelUrlForClient("corr-123", ready())).toBeNull();
      },
    );

    it("does NOT switch tracking on for anyone when set to a non-off value", () => {
      process.env.OPEN_TRACKING_PIXEL = "on";
      const decision = decideClientOpenTracking(client(VERIFIED_DOMAIN));
      expect(decision.enabled).toBe(false);
      expect(decision).toMatchObject({ reason: "CLIENT_NOT_OPTED_IN" });
      expect(buildOpenTrackingPixelUrlForClient("corr-123", client(VERIFIED_DOMAIN))).toBeNull();
    });
  });

  /**
   * The inner gate row 41 adds. A verified `go.` host proves the LINK resolves
   * to us; it says nothing about whether the domain's own email authentication
   * is real. Both must hold, because a tracked email is judged on both: the
   * pixel host must align AND the message must authenticate, or it is
   * quarantined for whichever one is missing.
   */
  describe("the email-authentication gate (SPF/DKIM/DMARC verified by us)", () => {
    const NOW = new Date("2026-08-28T12:00:00.000Z");
    const optedIn = (trackingDnsVerifiedAt: Date | null) =>
      client({ ...VERIFIED_DOMAIN, openTrackingEnabledAt: OPTED_IN_AT, trackingDnsVerifiedAt });

    it("REFUSES a client whose DNS this system has never checked", () => {
      // The default, and the one that matters most: absence is not permission.
      const decision = decideClientOpenTracking(optedIn(null), NOW);
      expect(decision.enabled).toBe(false);
      expect(decision).toMatchObject({ reason: "EMAIL_AUTH_NOT_VERIFIED" });
      expect(buildOpenTrackingPixelUrlForClient("corr-123", optedIn(null), NOW)).toBeNull();
    });

    it("allows a client whose DNS passed all four checks recently", () => {
      const decision = decideClientOpenTracking(
        optedIn(new Date("2026-08-28T06:00:00.000Z")),
        NOW,
      );
      expect(decision).toEqual({ enabled: true, baseUrl: "https://go.paratus365.com" });
    });

    it("REFUSES once the last passing check goes stale, WITHOUT anything having to run", () => {
      /*
        This is the load-bearing one, and it is the difference between a gate and
        a decoration.

        The scheduled re-check is what NOTICES a regression and switches a client
        off. But this project has six recorded instances of something built,
        wired, reporting success and never actually firing. If the schedule is the
        only thing that can turn tracking off, then the day it silently stops
        running is the day every client's tracking stays on for ever against DNS
        nobody is looking at any more.

        So staleness is decided HERE, at dispatch, from the timestamp alone. A
        verification that is too old fails closed by arithmetic. The cron makes
        the state fresh; it is not what makes the state safe.
      */
      const stale = new Date(NOW.getTime() - (TRACKING_DNS_MAX_AGE_DAYS + 1) * 86_400_000);
      const decision = decideClientOpenTracking(optedIn(stale), NOW);
      expect(decision.enabled).toBe(false);
      expect(decision).toMatchObject({ reason: "EMAIL_AUTH_STALE" });
      expect(buildOpenTrackingPixelUrlForClient("corr-123", optedIn(stale), NOW)).toBeNull();
    });

    it("still allows a check taken just inside the freshness window", () => {
      const justInside = new Date(
        NOW.getTime() - (TRACKING_DNS_MAX_AGE_DAYS * 86_400_000 - 60_000),
      );
      expect(decideClientOpenTracking(optedIn(justInside), NOW).enabled).toBe(true);
    });

    it("puts the email-auth gate INSIDE the link-domain one, so the outer failure is reported first", () => {
      // Both are broken. Staff should be told to fix the link domain, which is
      // the thing that blocks everything else, rather than chase DNS records
      // for a host that does not exist yet.
      const decision = decideClientOpenTracking(
        client({
          outreachLinkDomain: null,
          outreachLinkDomainVerifiedAt: null,
          openTrackingEnabledAt: OPTED_IN_AT,
          trackingDnsVerifiedAt: null,
        }),
        NOW,
      );
      expect(decision).toMatchObject({ reason: "LINK_DOMAIN_NOT_VERIFIED" });
    });
  });
});

/**
 * Isolation — Greg named this risk himself: "so that we dont accidently have
 * open tracking leaking into another customers account, which would put their
 * account at risk."
 */
describe("per-client isolation", () => {
  const NOW = new Date("2026-08-28T12:00:00.000Z");
  const FRESH = new Date("2026-08-28T06:00:00.000Z");

  const clientA: ClientOpenTrackingFields = {
    outreachLinkDomain: "go.paratus365.com",
    outreachLinkDomainVerifiedAt: new Date("2026-08-01T00:00:00.000Z"),
    openTrackingEnabledAt: new Date("2026-08-20T00:00:00.000Z"),
    trackingDnsVerifiedAt: FRESH,
  };
  /** Same shape, different customer, and nobody has switched them on. */
  const clientB: ClientOpenTrackingFields = {
    outreachLinkDomain: "go.othercustomer.co.uk",
    outreachLinkDomainVerifiedAt: new Date("2026-08-01T00:00:00.000Z"),
    openTrackingEnabledAt: null,
    trackingDnsVerifiedAt: FRESH,
  };

  it("enabling tracking for A leaves B untracked", () => {
    expect(decideClientOpenTracking(clientA, NOW).enabled).toBe(true);
    expect(decideClientOpenTracking(clientB, NOW).enabled).toBe(false);
    expect(buildOpenTrackingPixelUrlForClient("corr-1", clientB, NOW)).toBeNull();
  });

  it("a tracking link minted for A can never carry B's host", () => {
    const urlA = buildOpenTrackingPixelUrlForClient("corr-1", clientA, NOW);
    expect(urlA).toBe("https://go.paratus365.com/api/track/open/corr-1");
    expect(urlA).not.toContain("othercustomer");
  });

  it("switching B on later does not change what A's link points at", () => {
    const enabledB = { ...clientB, openTrackingEnabledAt: new Date("2026-08-28T09:00:00.000Z") };
    expect(buildOpenTrackingPixelUrlForClient("corr-1", enabledB, NOW)).toBe(
      "https://go.othercustomer.co.uk/api/track/open/corr-1",
    );
    expect(buildOpenTrackingPixelUrlForClient("corr-1", clientA, NOW)).toBe(
      "https://go.paratus365.com/api/track/open/corr-1",
    );
  });

  it("B failing its DNS re-check does not disturb A", () => {
    const brokenB = { ...clientB, openTrackingEnabledAt: FRESH, trackingDnsVerifiedAt: null };
    expect(decideClientOpenTracking(brokenB, NOW).enabled).toBe(false);
    expect(decideClientOpenTracking(clientA, NOW).enabled).toBe(true);
  });
});
