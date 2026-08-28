import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildOpenTrackingPixelUrlForClient,
  decideClientOpenTracking,
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

function client(overrides: Partial<ClientOpenTrackingFields> = {}): ClientOpenTrackingFields {
  return {
    outreachLinkDomain: null,
    outreachLinkDomainVerifiedAt: null,
    openTrackingEnabledAt: null,
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
});
