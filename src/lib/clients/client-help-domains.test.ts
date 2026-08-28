import { describe, expect, it } from "vitest";

import {
  domainFromWebsite,
  resolveClientHelpDomains,
} from "@/lib/clients/client-help-domains";

/**
 * Owner request A (2026-08-28).
 *
 * The Microsoft admin-consent and SPF/DKIM/DMARC help panels used to be
 * derived from the CONNECTED MAILBOXES only, so a client with no mailbox
 * connected saw nothing at all — which is precisely the moment staff need the
 * instructions, because the instructions are how the mailbox gets connected.
 *
 * This module is the fallback chain: connected mailboxes first (they are the
 * ground truth about how a domain sends), then the client's own website, then
 * the recorded default sender address. When none of those give a domain we say
 * so explicitly rather than rendering nothing.
 */

describe("domainFromWebsite", () => {
  it("strips protocol, www, path, query and port", () => {
    expect(domainFromWebsite("https://www.chevronsecurity.co.uk/about?a=1")).toBe(
      "chevronsecurity.co.uk",
    );
    expect(domainFromWebsite("http://paratus365.com")).toBe("paratus365.com");
    expect(domainFromWebsite("example.co.uk:8443/x")).toBe("example.co.uk");
    expect(domainFromWebsite("  WWW.Example.COM  ")).toBe("example.com");
  });

  it("returns null for values that are not a domain", () => {
    expect(domainFromWebsite(null)).toBeNull();
    expect(domainFromWebsite("")).toBeNull();
    expect(domainFromWebsite("   ")).toBeNull();
    expect(domainFromWebsite("https://")).toBeNull();
    expect(domainFromWebsite("localhost")).toBeNull();
  });
});

describe("resolveClientHelpDomains — connected mailboxes present", () => {
  it("derives one entry per sending domain and marks the provider", () => {
    const out = resolveClientHelpDomains({
      mailboxes: [
        { email: "sam@paratus365.com", provider: "MICROSOFT" },
        { email: "james@paratus365.com", provider: "MICROSOFT" },
        { email: "lucy@othergroup.co.uk", provider: "GOOGLE" },
      ],
      website: "https://www.paratus365.com",
      defaultSenderEmail: null,
    });

    expect(out.source).toBe("MAILBOXES");
    expect(out.deliverability).toEqual([
      { domain: "paratus365.com", provider: "MICROSOFT" },
      { domain: "othergroup.co.uk", provider: "GOOGLE" },
    ]);
    expect(out.microsoftDomains).toEqual(["paratus365.com"]);
  });

  it("marks a domain MIXED when it sends via both providers", () => {
    const out = resolveClientHelpDomains({
      mailboxes: [
        { email: "a@acme.com", provider: "MICROSOFT" },
        { email: "b@acme.com", provider: "GOOGLE" },
      ],
      website: null,
      defaultSenderEmail: null,
    });
    expect(out.deliverability).toEqual([
      { domain: "acme.com", provider: "MIXED" },
    ]);
    // A MIXED domain still has Microsoft mailboxes, so the admin-consent link
    // is still the right thing to hand the customer's IT.
    expect(out.microsoftDomains).toEqual(["acme.com"]);
  });
});

describe("resolveClientHelpDomains — the gap the owner reported", () => {
  it("still produces help for a client with NO mailboxes, from its website", () => {
    const out = resolveClientHelpDomains({
      mailboxes: [],
      website: "https://www.chevronsecurity.co.uk/contact",
      defaultSenderEmail: null,
    });

    expect(out.source).toBe("CLIENT_RECORD");
    // Provider is genuinely unknown before a mailbox connects, so show both
    // paths rather than guessing one and giving the customer wrong steps.
    expect(out.deliverability).toEqual([
      { domain: "chevronsecurity.co.uk", provider: "MIXED" },
    ]);
    expect(out.microsoftDomains).toEqual(["chevronsecurity.co.uk"]);
  });

  it("falls back to the recorded default sender address when there is no website", () => {
    const out = resolveClientHelpDomains({
      mailboxes: [],
      website: null,
      defaultSenderEmail: "hello@Northgate-Group.com",
    });
    expect(out.source).toBe("CLIENT_RECORD");
    expect(out.deliverability).toEqual([
      { domain: "northgate-group.com", provider: "MIXED" },
    ]);
  });

  it("reports UNKNOWN — not an empty list — when nothing gives a domain", () => {
    const out = resolveClientHelpDomains({
      mailboxes: [],
      website: null,
      defaultSenderEmail: null,
    });
    expect(out.source).toBe("UNKNOWN");
    expect(out.deliverability).toEqual([]);
    expect(out.microsoftDomains).toEqual([]);
  });

  it("ignores mailbox rows with an unusable email address", () => {
    const out = resolveClientHelpDomains({
      mailboxes: [{ email: "not-an-address", provider: "MICROSOFT" }],
      website: "acme.com",
      defaultSenderEmail: null,
    });
    expect(out.source).toBe("CLIENT_RECORD");
    expect(out.deliverability).toEqual([{ domain: "acme.com", provider: "MIXED" }]);
  });
});
