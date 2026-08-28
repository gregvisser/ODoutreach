/**
 * The verifier that RESOLVES a client's DNS, and the sweep that re-checks every
 * tracked client and switches off the ones that have regressed.
 *
 * The resolver is injected, so these tests drive real DNS failure modes —
 * NXDOMAIN, a selector that stops resolving, a timeout — without depending on
 * anybody's live records. The point of the row is that the SYSTEM looks; the
 * point of these tests is that it looks correctly and refuses when it cannot.
 */

import { describe, expect, it, vi } from "vitest";

import {
  buildTrackingDnsAnswers,
  resolveClientTrackingDnsProvider,
  sweepTrackingDnsRegressions,
  type TrackingDnsResolver,
  type TrackedClientRow,
} from "./tracking-dns-verification";

const APP_HOST = "app-opensdoors-outreach-prod.azurewebsites.net";

/** A resolver whose every answer is correct, so a test can break exactly one. */
function goodResolver(overrides: Partial<TrackingDnsResolver> = {}): TrackingDnsResolver {
  return {
    resolveTxt: vi.fn(async (host: string) => {
      if (host === "contoso.com") return [["v=spf1 include:spf.protection.outlook.com -all"]];
      if (host === "_dmarc.contoso.com") return [["v=DMARC1; p=none"]];
      return [];
    }),
    resolveCname: vi.fn(async (host: string) => {
      if (host.startsWith("selector1.")) return ["s1.contoso.onmicrosoft.com"];
      if (host.startsWith("selector2.")) return ["s2.contoso.onmicrosoft.com"];
      if (host === "go.contoso.com") return [APP_HOST];
      return [];
    }),
    probeServesOurApp: vi.fn(async () => true),
    ...overrides,
  };
}

const CLIENT: TrackedClientRow = {
  id: "client-a",
  name: "Contoso",
  outreachLinkDomain: "go.contoso.com",
  outreachLinkDomainVerifiedAt: new Date("2026-08-01T00:00:00.000Z"),
  openTrackingEnabledAt: new Date("2026-08-20T00:00:00.000Z"),
  trackingDnsVerifiedAt: new Date("2026-08-27T00:00:00.000Z"),
  mailboxes: [{ email: "sales@contoso.com", provider: "MICROSOFT" }],
};

describe("resolveClientTrackingDnsProvider", () => {
  it("reads MICROSOFT from the client's own mailboxes", () => {
    expect(
      resolveClientTrackingDnsProvider([{ email: "a@contoso.com", provider: "MICROSOFT" }]),
    ).toBe("MICROSOFT");
  });

  it("reads GOOGLE from the client's own mailboxes", () => {
    expect(
      resolveClientTrackingDnsProvider([{ email: "a@contoso.com", provider: "GOOGLE" }]),
    ).toBe("GOOGLE");
  });

  it("returns BOTH when a domain sends through both platforms", () => {
    // Not hypothetical, and getting it wrong is a real failure: checking only
    // one platform's records would pass a domain half of whose mail fails SPF.
    expect(
      resolveClientTrackingDnsProvider([
        { email: "a@contoso.com", provider: "MICROSOFT" },
        { email: "b@contoso.com", provider: "GOOGLE" },
      ]),
    ).toBe("BOTH");
  });

  it("returns null when there are no mailboxes to read a platform from", () => {
    // Refuses rather than guessing. A guess here would decide which SPF include
    // to demand, and the wrong guess passes a domain that cannot authenticate.
    expect(resolveClientTrackingDnsProvider([])).toBeNull();
  });
});

describe("buildTrackingDnsAnswers", () => {
  it("resolves every record the four checks need and passes them all", async () => {
    const resolver = goodResolver();
    const answers = await buildTrackingDnsAnswers(
      { sendingDomain: "contoso.com", trackingHost: "go.contoso.com", provider: "MICROSOFT" },
      resolver,
    );
    expect(answers.txt).toContain("v=spf1 include:spf.protection.outlook.com -all");
    expect(answers.dmarcTxt).toContain("v=DMARC1; p=none");
    expect(answers.dkim["selector1._domainkey"]).toEqual(["s1.contoso.onmicrosoft.com"]);
    expect(answers.servesOurApp).toBe(true);
  });

  it("joins a TXT record the resolver returned as 255-byte chunks", async () => {
    // node:dns hands back string[][]; a long SPF record arrives in pieces and
    // must be joined before it is parsed, or it never matches anything.
    const resolver = goodResolver({
      resolveTxt: vi.fn(async (host: string) =>
        host === "contoso.com"
          ? [["v=spf1 include:spf.protection", ".outlook.com -all"]]
          : [["v=DMARC1; p=none"]],
      ),
    });
    const answers = await buildTrackingDnsAnswers(
      { sendingDomain: "contoso.com", trackingHost: "go.contoso.com", provider: "MICROSOFT" },
      resolver,
    );
    expect(answers.txt).toContain("v=spf1 include:spf.protection.outlook.com -all");
  });

  it("treats an NXDOMAIN as 'no records', not as an error that aborts the check", async () => {
    // A domain with no SPF must produce a FAILING check with a readable reason,
    // not a thrown exception that leaves the client's state untouched.
    const resolver = goodResolver({
      resolveTxt: vi.fn(async () => {
        throw Object.assign(new Error("queryTxt ENOTFOUND"), { code: "ENOTFOUND" });
      }),
    });
    const answers = await buildTrackingDnsAnswers(
      { sendingDomain: "contoso.com", trackingHost: "go.contoso.com", provider: "MICROSOFT" },
      resolver,
    );
    expect(answers.txt).toEqual([]);
    expect(answers.dmarcTxt).toEqual([]);
  });

  it("does not probe HTTPS at all when there is no tracking host", async () => {
    const resolver = goodResolver();
    await buildTrackingDnsAnswers(
      { sendingDomain: "contoso.com", trackingHost: null, provider: "MICROSOFT" },
      resolver,
    );
    expect(resolver.probeServesOurApp).not.toHaveBeenCalled();
  });

  it("only looks up the Google selector for a Google domain, and vice versa", async () => {
    const resolver = goodResolver();
    await buildTrackingDnsAnswers(
      { sendingDomain: "contoso.com", trackingHost: "go.contoso.com", provider: "GOOGLE" },
      resolver,
    );
    const cnamed = (resolver.resolveCname as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => c[0] as string,
    );
    expect(cnamed.some((h) => h.startsWith("selector1."))).toBe(false);
  });
});

describe("sweepTrackingDnsRegressions — the scheduled re-check that DISABLES", () => {
  const NOW = new Date("2026-08-28T12:00:00.000Z");

  it("refreshes the verification timestamp for a client that still passes", async () => {
    const disable = vi.fn();
    const record = vi.fn();
    const result = await sweepTrackingDnsRegressions({
      clients: [CLIENT],
      resolver: goodResolver(),
      now: NOW,
      disableTracking: disable,
      recordCheck: record,
    });
    expect(result.checked).toBe(1);
    expect(result.disabled).toEqual([]);
    expect(disable).not.toHaveBeenCalled();
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "client-a", pass: true, verifiedAt: NOW }),
    );
  });

  it("DISABLES tracking for a client whose SPF has regressed to ~all", async () => {
    /*
      The behaviour the row actually asks for, and the one worth proving fires.
      A customer's IT department relaxes SPF to ~all months after we verified
      them. Nobody tells us. The sweep must notice and switch that client off by
      itself, without a human in the loop.
    */
    const disable = vi.fn();
    const resolver = goodResolver({
      resolveTxt: vi.fn(async (host: string) =>
        host === "contoso.com"
          ? [["v=spf1 include:spf.protection.outlook.com ~all"]]
          : [["v=DMARC1; p=none"]],
      ),
    });
    const result = await sweepTrackingDnsRegressions({
      clients: [CLIENT],
      resolver,
      now: NOW,
      disableTracking: disable,
      recordCheck: vi.fn(),
    });
    expect(result.disabled).toEqual(["client-a"]);
    expect(disable).toHaveBeenCalledOnce();
    expect(disable).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "client-a",
        failedLabels: ["SPF"],
      }),
    );
  });

  it("DISABLES a client whose DKIM selector has stopped resolving", async () => {
    const disable = vi.fn();
    const resolver = goodResolver({
      resolveCname: vi.fn(async (host: string) => {
        if (host.startsWith("selector1.")) return ["s1.contoso.onmicrosoft.com"];
        if (host === "go.contoso.com") return [APP_HOST];
        return []; // selector2 has gone
      }),
    });
    const result = await sweepTrackingDnsRegressions({
      clients: [CLIENT],
      resolver,
      now: NOW,
      disableTracking: disable,
      recordCheck: vi.fn(),
    });
    expect(result.disabled).toEqual(["client-a"]);
  });

  it("DISABLES a client whose tracking host has stopped serving our app", async () => {
    const disable = vi.fn();
    const result = await sweepTrackingDnsRegressions({
      clients: [CLIENT],
      resolver: goodResolver({ probeServesOurApp: vi.fn(async () => false) }),
      now: NOW,
      disableTracking: disable,
      recordCheck: vi.fn(),
    });
    expect(result.disabled).toEqual(["client-a"]);
  });

  it("ISOLATION: disabling A leaves B alone, and B's failure leaves A alone", async () => {
    /*
      Greg named this risk in his own words — tracking must never leak between
      customers. The sweep touches many clients in one run, so it is exactly
      where a leak would happen: one shared resolver, one shared loop, one
      mistaken variable and client B is switched off because client A's SPF
      broke, or worse, left ON because A's passed.
    */
    const clientB: TrackedClientRow = {
      id: "client-b",
      name: "Fabrikam",
      outreachLinkDomain: "go.fabrikam.co.uk",
      outreachLinkDomainVerifiedAt: new Date("2026-08-01T00:00:00.000Z"),
      openTrackingEnabledAt: new Date("2026-08-20T00:00:00.000Z"),
      trackingDnsVerifiedAt: new Date("2026-08-27T00:00:00.000Z"),
      mailboxes: [{ email: "hello@fabrikam.co.uk", provider: "MICROSOFT" }],
    };
    // Only contoso.com is broken. fabrikam.co.uk is perfect.
    const resolver: TrackingDnsResolver = {
      resolveTxt: vi.fn(async (host: string) => {
        if (host === "contoso.com") return [["v=spf1 -all"]]; // no platform authorised
        if (host === "fabrikam.co.uk")
          return [["v=spf1 include:spf.protection.outlook.com -all"]];
        if (host.startsWith("_dmarc.")) return [["v=DMARC1; p=none"]];
        return [];
      }),
      resolveCname: vi.fn(async (host: string) => {
        if (host.startsWith("selector")) return ["selector.onmicrosoft.com"];
        if (host === "go.contoso.com" || host === "go.fabrikam.co.uk") return [APP_HOST];
        return [];
      }),
      probeServesOurApp: vi.fn(async () => true),
    };
    const disable = vi.fn();
    const result = await sweepTrackingDnsRegressions({
      clients: [CLIENT, clientB],
      resolver,
      now: NOW,
      disableTracking: disable,
      recordCheck: vi.fn(),
    });
    expect(result.checked).toBe(2);
    expect(result.disabled).toEqual(["client-a"]);
    expect(disable).toHaveBeenCalledOnce();
    expect(disable.mock.calls[0][0]).toMatchObject({ clientId: "client-a" });
  });

  it("keeps checking the remaining clients when one client's DNS lookup throws", async () => {
    // A single unreachable nameserver must not silently end the sweep and leave
    // every later client unchecked — that is how a regression goes unnoticed
    // while the job still reports success.
    const clientB: TrackedClientRow = { ...CLIENT, id: "client-b" };
    let call = 0;
    const resolver = goodResolver({
      probeServesOurApp: vi.fn(async () => {
        call += 1;
        if (call === 1) throw new Error("socket hang up");
        return true;
      }),
    });
    const disable = vi.fn();
    const result = await sweepTrackingDnsRegressions({
      clients: [CLIENT, clientB],
      resolver,
      now: NOW,
      disableTracking: disable,
      recordCheck: vi.fn(),
    });
    expect(result.checked).toBe(2);
    // The one that threw is treated as FAILING, never as passing.
    expect(result.disabled).toEqual(["client-a"]);
  });

  it("REFUSES a client with no mailboxes rather than passing it by default", async () => {
    const disable = vi.fn();
    const result = await sweepTrackingDnsRegressions({
      clients: [{ ...CLIENT, mailboxes: [] }],
      resolver: goodResolver(),
      now: NOW,
      disableTracking: disable,
      recordCheck: vi.fn(),
    });
    expect(result.disabled).toEqual(["client-a"]);
  });

  it("checks only clients that are actually opted in — an untracked client is not touched", async () => {
    const disable = vi.fn();
    const record = vi.fn();
    const result = await sweepTrackingDnsRegressions({
      clients: [{ ...CLIENT, openTrackingEnabledAt: null }],
      resolver: goodResolver(),
      now: NOW,
      disableTracking: disable,
      recordCheck: record,
    });
    expect(result.checked).toBe(0);
    expect(record).not.toHaveBeenCalled();
    expect(disable).not.toHaveBeenCalled();
  });
});
