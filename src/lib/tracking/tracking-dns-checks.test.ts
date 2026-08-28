/**
 * The four DNS checks that must pass before a client's outreach may carry an
 * open-tracking pixel.
 *
 * These are PURE: they take DNS answers that a caller has already resolved and
 * return a verdict. That split is deliberate and is what makes this file able to
 * go red first — the network is not involved, so every "what if their SPF says
 * ~all" case is a literal rather than a domain somebody has to go and misconfigure.
 *
 * The bar is set by the incident, not by taste. A tracking pixel is a hidden
 * image loaded from a host that must ALIGN with the From: domain; when it does
 * not, the message reads as phishing and gets quarantined. That is what happened
 * to this client in 2026. So "the customer said they did the DNS" is not
 * evidence, and neither is a tick-box — only a resolved record is.
 */

import { describe, expect, it } from "vitest";

import {
  checkDkim,
  checkDmarc,
  checkSpf,
  checkTrackingHost,
  summariseTrackingDnsChecks,
  type TrackingDnsAnswers,
} from "./tracking-dns-checks";

const MICROSOFT_SPF = "v=spf1 include:spf.protection.outlook.com -all";
const GOOGLE_SPF = "v=spf1 include:_spf.google.com -all";

describe("checkSpf", () => {
  it("passes a Microsoft domain whose SPF includes Outlook and ends -all", () => {
    const r = checkSpf({ provider: "MICROSOFT", txt: [MICROSOFT_SPF] });
    expect(r.pass).toBe(true);
  });

  it("passes a Google domain whose SPF includes Google and ends -all", () => {
    const r = checkSpf({ provider: "GOOGLE", txt: [GOOGLE_SPF] });
    expect(r.pass).toBe(true);
  });

  it("REFUSES a soft-fail ~all, which authorises the world to spoof the domain", () => {
    const r = checkSpf({
      provider: "MICROSOFT",
      txt: ["v=spf1 include:spf.protection.outlook.com ~all"],
    });
    expect(r.pass).toBe(false);
    expect(r.detail).toMatch(/-all/);
  });

  it("REFUSES ?all and +all for the same reason", () => {
    for (const qualifier of ["?all", "+all"]) {
      const r = checkSpf({
        provider: "MICROSOFT",
        txt: [`v=spf1 include:spf.protection.outlook.com ${qualifier}`],
      });
      expect(r.pass).toBe(false);
    }
  });

  it("REFUSES an SPF record that does not authorise the platform actually sending", () => {
    // Their SPF is well-formed and strict, but it names Google while the
    // mailbox sends through Microsoft. Strictness is not alignment.
    const r = checkSpf({ provider: "MICROSOFT", txt: [GOOGLE_SPF] });
    expect(r.pass).toBe(false);
    expect(r.detail).toMatch(/spf\.protection\.outlook\.com/);
  });

  it("REFUSES a domain with no SPF record at all", () => {
    expect(checkSpf({ provider: "MICROSOFT", txt: [] }).pass).toBe(false);
  });

  it("REFUSES a domain publishing two SPF records — RFC 7208 makes that a permerror", () => {
    const r = checkSpf({ provider: "MICROSOFT", txt: [MICROSOFT_SPF, GOOGLE_SPF] });
    expect(r.pass).toBe(false);
    expect(r.detail).toMatch(/more than one/i);
  });

  it("ignores unrelated TXT records sitting alongside the SPF one", () => {
    const r = checkSpf({
      provider: "MICROSOFT",
      txt: ["google-site-verification=abc123", MICROSOFT_SPF, "MS=ms12345678"],
    });
    expect(r.pass).toBe(true);
  });

  it("reads a TXT record that the resolver returned split into chunks", () => {
    // node:dns returns each TXT record as string[] of 255-byte chunks; a long
    // SPF record arrives in pieces and must be joined before it is parsed.
    const r = checkSpf({
      provider: "MICROSOFT",
      txt: ["v=spf1 include:spf.protection.outlook.com" + " -all"],
    });
    expect(r.pass).toBe(true);
  });

  it("is case-insensitive and tolerant of extra whitespace", () => {
    const r = checkSpf({
      provider: "MICROSOFT",
      txt: ["  V=SPF1   INCLUDE:SPF.PROTECTION.OUTLOOK.COM   -ALL  "],
    });
    expect(r.pass).toBe(true);
  });

  it("REFUSES when the domain sends through both providers but SPF names only one", () => {
    const r = checkSpf({ provider: "BOTH", txt: [MICROSOFT_SPF] });
    expect(r.pass).toBe(false);
    expect(r.detail).toMatch(/_spf\.google\.com/);
  });
});

describe("checkDkim", () => {
  it("passes Microsoft when both selector CNAMEs resolve", () => {
    const r = checkDkim({
      provider: "MICROSOFT",
      dkim: {
        "selector1._domainkey": ["selector1-contoso-com._domainkey.contoso.onmicrosoft.com"],
        "selector2._domainkey": ["selector2-contoso-com._domainkey.contoso.onmicrosoft.com"],
      },
      dkimTxt: {},
    });
    expect(r.pass).toBe(true);
  });

  it("REFUSES Microsoft when only selector1 resolves — DKIM rotation needs both", () => {
    const r = checkDkim({
      provider: "MICROSOFT",
      dkim: {
        "selector1._domainkey": ["selector1-contoso-com._domainkey.contoso.onmicrosoft.com"],
        "selector2._domainkey": [],
      },
      dkimTxt: {},
    });
    expect(r.pass).toBe(false);
    expect(r.detail).toMatch(/selector2/);
  });

  it("REFUSES Microsoft when neither selector resolves", () => {
    const r = checkDkim({
      provider: "MICROSOFT",
      dkim: { "selector1._domainkey": [], "selector2._domainkey": [] },
      dkimTxt: {},
    });
    expect(r.pass).toBe(false);
  });

  it("passes Google on a TXT key at google._domainkey, because Google does not use a CNAME", () => {
    // Not a detail to paper over: Microsoft publishes two CNAMEs, Google
    // publishes one TXT public key. A checker that only looked for CNAMEs would
    // declare every correctly-configured Google domain broken.
    const r = checkDkim({
      provider: "GOOGLE",
      dkim: {},
      dkimTxt: { "google._domainkey": ["v=DKIM1; k=rsa; p=MIIBIjANBgkq"] },
    });
    expect(r.pass).toBe(true);
  });

  it("REFUSES a Google DKIM TXT record that exists but carries no public key", () => {
    const r = checkDkim({
      provider: "GOOGLE",
      dkim: {},
      dkimTxt: { "google._domainkey": ["v=DKIM1; k=rsa; p="] },
    });
    expect(r.pass).toBe(false);
    expect(r.detail).toMatch(/revoked|no public key/i);
  });

  it("REFUSES Google when nothing is published at google._domainkey", () => {
    const r = checkDkim({ provider: "GOOGLE", dkim: {}, dkimTxt: {} });
    expect(r.pass).toBe(false);
  });

  it("requires BOTH providers' DKIM when a domain sends through both", () => {
    const microsoftOnly = checkDkim({
      provider: "BOTH",
      dkim: {
        "selector1._domainkey": ["a"],
        "selector2._domainkey": ["b"],
      },
      dkimTxt: {},
    });
    expect(microsoftOnly.pass).toBe(false);
    expect(microsoftOnly.detail).toMatch(/google/i);
  });
});

describe("checkDmarc", () => {
  it("passes when a DMARC record is published at _dmarc.<domain>", () => {
    const r = checkDmarc({ dmarcTxt: ["v=DMARC1; p=none; rua=mailto:dmarc@contoso.com"] });
    expect(r.pass).toBe(true);
  });

  it("passes p=quarantine and p=reject, which are stricter than the minimum", () => {
    expect(checkDmarc({ dmarcTxt: ["v=DMARC1; p=quarantine"] }).pass).toBe(true);
    expect(checkDmarc({ dmarcTxt: ["v=DMARC1; p=reject"] }).pass).toBe(true);
  });

  it("REFUSES when no DMARC record exists", () => {
    expect(checkDmarc({ dmarcTxt: [] }).pass).toBe(false);
  });

  it("REFUSES a TXT record at _dmarc that is not a DMARC record", () => {
    const r = checkDmarc({ dmarcTxt: ["some unrelated verification string"] });
    expect(r.pass).toBe(false);
  });

  it("REFUSES a DMARC record with no policy tag — it instructs receivers to do nothing", () => {
    const r = checkDmarc({ dmarcTxt: ["v=DMARC1; rua=mailto:dmarc@contoso.com"] });
    expect(r.pass).toBe(false);
    expect(r.detail).toMatch(/p=/);
  });

  it("REFUSES two DMARC records, which receivers treat as none", () => {
    const r = checkDmarc({ dmarcTxt: ["v=DMARC1; p=none", "v=DMARC1; p=reject"] });
    expect(r.pass).toBe(false);
    expect(r.detail).toMatch(/more than one/i);
  });
});

describe("checkTrackingHost", () => {
  it("passes when the client's own go. subdomain CNAMEs to our app", () => {
    const r = checkTrackingHost({
      trackingHost: "go.contoso.com",
      sendingDomain: "contoso.com",
      cname: ["app-opensdoors-outreach-prod.azurewebsites.net"],
      servesOurApp: true,
    });
    expect(r.pass).toBe(true);
  });

  it("REFUSES a tracking host that is NOT a subdomain of the sending domain", () => {
    // This is the whole 2026 quarantine in one assertion: the link domain and
    // the From: domain must match, or the mail reads as phishing.
    const r = checkTrackingHost({
      trackingHost: "go.opensdoors.co.uk",
      sendingDomain: "contoso.com",
      cname: ["app-opensdoors-outreach-prod.azurewebsites.net"],
      servesOurApp: true,
    });
    expect(r.pass).toBe(false);
    expect(r.detail).toMatch(/contoso\.com/);
  });

  it("REFUSES when the CNAME resolves somewhere that is not us", () => {
    const r = checkTrackingHost({
      trackingHost: "go.contoso.com",
      sendingDomain: "contoso.com",
      cname: ["some-other-tenant.example.net"],
      servesOurApp: false,
    });
    expect(r.pass).toBe(false);
  });

  it("REFUSES when DNS points at us but HTTPS is not yet serving our app", () => {
    // DNS resolving is not the same as the certificate being bound. A link that
    // throws a certificate warning is worse than no link.
    const r = checkTrackingHost({
      trackingHost: "go.contoso.com",
      sendingDomain: "contoso.com",
      cname: ["app-opensdoors-outreach-prod.azurewebsites.net"],
      servesOurApp: false,
    });
    expect(r.pass).toBe(false);
    expect(r.detail).toMatch(/certificate|serving/i);
  });

  it("REFUSES when there is no tracking host at all", () => {
    const r = checkTrackingHost({
      trackingHost: null,
      sendingDomain: "contoso.com",
      cname: [],
      servesOurApp: false,
    });
    expect(r.pass).toBe(false);
  });
});

describe("summariseTrackingDnsChecks", () => {
  const allGood: TrackingDnsAnswers = {
    provider: "MICROSOFT",
    sendingDomain: "contoso.com",
    trackingHost: "go.contoso.com",
    txt: [MICROSOFT_SPF],
    dmarcTxt: ["v=DMARC1; p=none"],
    dkim: {
      "selector1._domainkey": ["s1.contoso.onmicrosoft.com"],
      "selector2._domainkey": ["s2.contoso.onmicrosoft.com"],
    },
    dkimTxt: {},
    cname: ["app-opensdoors-outreach-prod.azurewebsites.net"],
    servesOurApp: true,
  };

  it("passes only when all four checks pass", () => {
    const s = summariseTrackingDnsChecks(allGood);
    expect(s.pass).toBe(true);
    expect(s.checks.map((c) => c.pass)).toEqual([true, true, true, true]);
  });

  it("FAILS THE WHOLE THING if any single check fails", () => {
    // Four ways to be unsafe; each one on its own is enough. Written as a loop
    // on purpose — a summary that ANDed three of four would still pass most of
    // these, and that is exactly the bug worth catching.
    const breakages: Array<[string, Partial<TrackingDnsAnswers>]> = [
      ["spf", { txt: ["v=spf1 include:spf.protection.outlook.com ~all"] }],
      ["dkim", { dkim: { "selector1._domainkey": [], "selector2._domainkey": [] } }],
      ["dmarc", { dmarcTxt: [] }],
      ["tracking host", { servesOurApp: false }],
    ];
    for (const [name, patch] of breakages) {
      const s = summariseTrackingDnsChecks({ ...allGood, ...patch });
      expect(s.pass, `${name} broken should fail the summary`).toBe(false);
    }
  });

  it("names every failing check, not just the first, so one round-trip fixes them all", () => {
    const s = summariseTrackingDnsChecks({
      ...allGood,
      txt: [],
      dmarcTxt: [],
    });
    expect(s.pass).toBe(false);
    expect(s.failedLabels).toEqual(expect.arrayContaining(["SPF", "DMARC"]));
    expect(s.failedLabels).not.toContain("DKIM");
  });

  it("always reports four checks in a stable order, so the screen never reshuffles", () => {
    const s = summariseTrackingDnsChecks(allGood);
    expect(s.checks.map((c) => c.label)).toEqual([
      "SPF",
      "DKIM",
      "DMARC",
      "Tracking host",
    ]);
  });
});
