import { describe, expect, it } from "vitest";

import {
  parseDmarcRuaLinks,
  parseSpfRedirectLink,
  planFamilyProposals,
  type DiscoveredLink,
  type ExistingProposal,
} from "./family-discovery";

/**
 * WRITTEN BEFORE THE RESOLVER EXISTED, per the brief. The tombstone test is the
 * important one.
 *
 * The defect it exists to prevent, found 2026-08-24: family rows are removed by
 * deleting them, with no record that a human said no. A resolution that runs
 * again every 30 days reads the same DNS, derives the same link, and silently
 * reinstates something an operator deliberately refused — and they will never
 * look again, because they already handled it.
 *
 * So `REJECTED` is a state, not an absence, and nothing may move a row out of
 * it. The test below runs resolution TWICE across a rejection and asserts the
 * row stays rejected.
 *
 * Everything here is pure. DNS and Prisma live in the caller.
 */

const link = (over: Partial<DiscoveredLink> = {}): DiscoveredLink => ({
  seedDomain: "bt.com",
  proposedDomain: "openreach.co.uk",
  source: "DMARC_RUA",
  evidence: "v=DMARC1; p=reject; rua=mailto:dmarc@bt.com",
  ...over,
});

describe("REJECTED is a tombstone — the 30-day re-run cannot resurrect it", () => {
  it("does not re-raise a link an operator rejected, however many times it resolves", () => {
    const discovered = [link()];
    const rejected: ExistingProposal[] = [
      { seedDomain: "bt.com", proposedDomain: "openreach.co.uk", status: "REJECTED" },
    ];

    // First re-run after the rejection.
    const first = planFamilyProposals({ links: discovered, existing: rejected });
    expect(first).toHaveLength(1);
    expect(first[0]?.kind).toBe("skip");
    if (first[0]?.kind === "skip") expect(first[0].reason).toBe("rejected_tombstone");

    // Thirty days later the DNS is unchanged, so the same link is discovered
    // again. It must still be refused.
    const second = planFamilyProposals({ links: discovered, existing: rejected });
    expect(second[0]?.kind).toBe("skip");

    // And nothing in the plan may write to that row.
    for (const plan of [...first, ...second]) {
      expect(plan.kind).not.toBe("create");
      expect(plan.kind).not.toBe("refresh");
    }
  });

  it("keeps the rejection even when the evidence changes", () => {
    // The company re-publishes its DMARC record with a different policy. The
    // link is the same link; the human's answer still stands.
    const rejected: ExistingProposal[] = [
      { seedDomain: "bt.com", proposedDomain: "openreach.co.uk", status: "REJECTED" },
    ];
    const plan = planFamilyProposals({
      links: [link({ evidence: "v=DMARC1; p=none; rua=mailto:dmarc@bt.com" })],
      existing: rejected,
    });
    expect(plan[0]?.kind).toBe("skip");
  });

  it("keeps the rejection even when a DIFFERENT source finds the same pair", () => {
    // Rejected on DMARC evidence, later found again via SPF. The operator
    // rejected the RELATIONSHIP, not one record.
    const plan = planFamilyProposals({
      links: [link({ source: "SPF_REDIRECT", evidence: "v=spf1 redirect=_spf.bt.com" })],
      existing: [
        { seedDomain: "bt.com", proposedDomain: "openreach.co.uk", status: "REJECTED" },
      ],
    });
    expect(plan[0]?.kind).toBe("skip");
    if (plan[0]?.kind === "skip") expect(plan[0].reason).toBe("rejected_tombstone");
  });

  it("does not re-raise something already confirmed either", () => {
    const plan = planFamilyProposals({
      links: [link()],
      existing: [
        { seedDomain: "bt.com", proposedDomain: "openreach.co.uk", status: "CONFIRMED" },
      ],
    });
    expect(plan[0]?.kind).toBe("skip");
    if (plan[0]?.kind === "skip") expect(plan[0].reason).toBe("already_confirmed");
  });

  it("DOES refresh a pending proposal, so the evidence stays current", () => {
    const plan = planFamilyProposals({
      links: [link()],
      existing: [
        { seedDomain: "bt.com", proposedDomain: "openreach.co.uk", status: "PENDING" },
      ],
    });
    expect(plan[0]?.kind).toBe("refresh");
  });

  it("raises a genuinely new link", () => {
    const plan = planFamilyProposals({ links: [link()], existing: [] });
    expect(plan[0]?.kind).toBe("create");
  });
});

describe("the fan-in cap keeps vendors off the list", () => {
  it("refuses a seed that many unrelated companies point at", () => {
    // Measured on production: outlook.com had 216 contact domains pointing at
    // it, google.com 11, salesforce.com 9. Every genuine relative had 1-2.
    //
    // salesforce.com rather than outlook.com, because outlook.com is caught
    // earlier by the consumer-mailbox rule and this test is about the CAP - the
    // guard that catches a corporate-looking vendor nobody has listed.
    const links = ["a.co.uk", "b.co.uk", "c.co.uk", "d.co.uk"].map((d) =>
      link({ seedDomain: "salesforce.com", proposedDomain: d }),
    );
    const plan = planFamilyProposals({ links, existing: [] });
    expect(plan).toHaveLength(4);
    for (const p of plan) {
      expect(p.kind).toBe("skip");
      if (p.kind === "skip") expect(p.reason).toBe("fan_in_cap");
    }
  });

  it("allows a seed only one or two companies point at", () => {
    const links = [
      link({ seedDomain: "bt.com", proposedDomain: "openreach.co.uk" }),
      link({ seedDomain: "bt.com", proposedDomain: "btplc.com" }),
    ];
    const plan = planFamilyProposals({ links, existing: [] });
    expect(plan.every((p) => p.kind === "create")).toBe(true);
  });

  it("records the fan-in on every proposal it raises", () => {
    // The cap is NOT the safety mechanism — the operator's click is. nhs.net
    // had fan-in 2 in the real data and is still a shared service, so the
    // number has to reach the screen.
    const links = [
      link({ seedDomain: "bt.com", proposedDomain: "openreach.co.uk" }),
      link({ seedDomain: "bt.com", proposedDomain: "btplc.com" }),
    ];
    const plan = planFamilyProposals({ links, existing: [] });
    for (const p of plan) {
      if (p.kind === "create") expect(p.fanIn).toBe(2);
    }
  });

  it("counts fan-in per seed, not across the whole run", () => {
    const links = [
      link({ seedDomain: "bt.com", proposedDomain: "openreach.co.uk" }),
      link({ seedDomain: "welbilt.com", proposedDomain: "merrychef.com" }),
      link({ seedDomain: "innocentdrinks.com", proposedDomain: "innocentdrinks.co.uk" }),
    ];
    const plan = planFamilyProposals({ links, existing: [] });
    expect(plan.every((p) => p.kind === "create")).toBe(true);
    for (const p of plan) if (p.kind === "create") expect(p.fanIn).toBe(1);
  });

  it("counts one company once, even if both sources find it", () => {
    // DMARC and SPF both pointing at the same seed is one relationship, not two
    // companies. Counting it twice would inflate fan-in toward the cap and
    // silently drop a genuine link.
    const links = [
      link({ seedDomain: "bt.com", proposedDomain: "openreach.co.uk", source: "DMARC_RUA" }),
      link({
        seedDomain: "bt.com",
        proposedDomain: "openreach.co.uk",
        source: "SPF_REDIRECT",
        evidence: "v=spf1 redirect=_spf.bt.com",
      }),
      link({ seedDomain: "bt.com", proposedDomain: "btplc.com" }),
    ];
    const plan = planFamilyProposals({ links, existing: [] });
    const created = plan.filter((p) => p.kind === "create");
    // Two companies, not three proposals.
    expect(created).toHaveLength(2);
    for (const p of created) if (p.kind === "create") expect(p.fanIn).toBe(2);
  });
});

describe("a consumer mailbox host is never a family member", () => {
  /**
   * FOUND BY MEASURING, 2026-08-24, on the real production data.
   *
   * The read-only run proposed `gmail.com belongs with google.com`, from
   * gmail.com's own DMARC record: `rua=mailto:mailauth-reports@google.com`.
   *
   * That link is CORRECT. Gmail is Google. And confirming it would have
   * suppressed every personal Gmail address for that client, because
   * google.com was on their do-not-contact list.
   *
   * Fan-in was 1, so the cap did not catch it — the cap detects a domain many
   * companies point at, and gmail.com points at exactly one. Truth is not the
   * test; usefulness is. A consumer mailbox provider is never a corporate
   * relative in the sense that matters here, whichever side of the link it is
   * on.
   */
  it("refuses gmail.com even though gmail IS google", () => {
    const plan = planFamilyProposals({
      links: [
        link({
          seedDomain: "google.com",
          proposedDomain: "gmail.com",
          evidence: "v=DMARC1; p=none; rua=mailto:mailauth-reports@google.com",
        }),
      ],
      existing: [],
    });
    expect(plan[0]?.kind).toBe("skip");
    if (plan[0]?.kind === "skip") expect(plan[0].reason).toBe("consumer_mailbox_host");
  });

  it("refuses the other consumer hosts too, on either side", () => {
    const hosts = [
      "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com",
      "msn.com", "yahoo.com", "ymail.com", "aol.com", "icloud.com", "me.com",
      "gmx.com", "proton.me", "protonmail.com", "mail.com", "yandex.com",
      "btinternet.com", "sky.com", "virginmedia.com", "talktalk.net",
    ];
    for (const host of hosts) {
      const asProposed = planFamilyProposals({
        links: [link({ seedDomain: "example.co.uk", proposedDomain: host })],
        existing: [],
      });
      expect(asProposed[0]?.kind, `${host} as proposed`).toBe("skip");

      const asSeed = planFamilyProposals({
        links: [link({ seedDomain: host, proposedDomain: "example.co.uk" })],
        existing: [],
      });
      expect(asSeed[0]?.kind, `${host} as seed`).toBe("skip");
    }
  });

  it("still allows an ordinary company domain", () => {
    const plan = planFamilyProposals({
      links: [
        link({ seedDomain: "gallifordtry.co.uk", proposedDomain: "morrisonconstruction.co.uk" }),
      ],
      existing: [],
    });
    expect(plan[0]?.kind).toBe("create");
  });

  it("matches a subdomain of a consumer host as well", () => {
    const plan = planFamilyProposals({
      links: [link({ seedDomain: "example.co.uk", proposedDomain: "mail.gmail.com" })],
      existing: [],
    });
    expect(plan[0]?.kind).toBe("skip");
  });
});

describe("parseDmarcRuaLinks", () => {
  it("reads a plain rua address", () => {
    const found = parseDmarcRuaLinks("openreach.co.uk", [
      "v=DMARC1; p=reject; rua=mailto:dmarc@bt.com",
    ]);
    expect(found).toEqual([
      {
        seedDomain: "bt.com",
        proposedDomain: "openreach.co.uk",
        source: "DMARC_RUA",
        evidence: "v=DMARC1; p=reject; rua=mailto:dmarc@bt.com",
      },
    ]);
  });

  it("strips the RFC 9990 size suffix", () => {
    // rua values are URIs with an optional !size limit: mailto:x@y.com!10m
    const found = parseDmarcRuaLinks("openreach.co.uk", [
      "v=DMARC1; p=none; rua=mailto:d@bt.com!10m",
    ]);
    expect(found[0]?.seedDomain).toBe("bt.com");
  });

  it("handles several comma-separated addresses", () => {
    const found = parseDmarcRuaLinks("openreach.co.uk", [
      "v=DMARC1; p=none; rua=mailto:a@bt.com, mailto:b@example.net",
    ]);
    expect(found.map((f) => f.seedDomain).sort()).toEqual(["bt.com", "example.net"]);
  });

  it("ignores a record that reports to its own domain", () => {
    // Self-reference says nothing about a relationship.
    expect(
      parseDmarcRuaLinks("bt.com", ["v=DMARC1; p=none; rua=mailto:dmarc@bt.com"]),
    ).toEqual([]);
    // A subdomain of itself is still itself.
    expect(
      parseDmarcRuaLinks("mail.bt.com", ["v=DMARC1; p=none; rua=mailto:d@bt.com"]),
    ).toEqual([]);
  });

  it("ignores anything that is not a DMARC record", () => {
    expect(parseDmarcRuaLinks("x.co.uk", ["v=spf1 include:_spf.google.com ~all"])).toEqual([]);
    expect(parseDmarcRuaLinks("x.co.uk", ["some google-site-verification=abc"])).toEqual([]);
  });

  it("requires v=DMARC1 to come first", () => {
    // RFC 9990 s4: the v tag is mandatory and MUST appear first.
    expect(parseDmarcRuaLinks("x.co.uk", ["p=reject; v=DMARC1; rua=mailto:d@bt.com"])).toEqual([]);
  });

  it("ignores a record with no rua at all", () => {
    expect(parseDmarcRuaLinks("x.co.uk", ["v=DMARC1; p=reject"])).toEqual([]);
  });

  it("survives junk without throwing", () => {
    expect(parseDmarcRuaLinks("x.co.uk", ["v=DMARC1; rua=mailto:"])).toEqual([]);
    expect(parseDmarcRuaLinks("x.co.uk", ["v=DMARC1; rua=not-a-uri"])).toEqual([]);
    expect(parseDmarcRuaLinks("x.co.uk", [])).toEqual([]);
  });
});

describe("parseSpfRedirectLink", () => {
  it("reads a redirect to another registrable domain", () => {
    const found = parseSpfRedirectLink("adidas.co.uk", ["v=spf1 redirect=_spf.adidas.com"]);
    expect(found).toEqual({
      seedDomain: "adidas.com",
      proposedDomain: "adidas.co.uk",
      source: "SPF_REDIRECT",
      evidence: "v=spf1 redirect=_spf.adidas.com",
    });
  });

  it("IGNORES include: entirely", () => {
    // RFC 7208 s5.2 defines include: as the mechanism for CROSSING an
    // administrative boundary; s6.1 designates redirect= for the same-authority
    // case. Measured on production, include: linked 216 contact domains to
    // outlook.com. It is not an ownership signal and is not read here.
    expect(
      parseSpfRedirectLink("x.co.uk", ["v=spf1 include:spf.protection.outlook.com -all"]),
    ).toBeNull();
    expect(
      parseSpfRedirectLink("x.co.uk", ["v=spf1 include:_spf.adidas.com -all"]),
    ).toBeNull();
  });

  it("ignores a redirect to its own domain", () => {
    expect(parseSpfRedirectLink("bt.com", ["v=spf1 redirect=_spf.bt.com"])).toBeNull();
  });

  it("ignores a redirect when an all mechanism is present", () => {
    // RFC 7208 s6.1: redirect is ignored entirely if the record has an `all`.
    expect(
      parseSpfRedirectLink("x.co.uk", ["v=spf1 -all redirect=_spf.bt.com"]),
    ).toBeNull();
  });

  it("ignores non-SPF records and junk", () => {
    expect(parseSpfRedirectLink("x.co.uk", ["v=DMARC1; p=none"])).toBeNull();
    expect(parseSpfRedirectLink("x.co.uk", ["v=spf1 redirect="])).toBeNull();
    expect(parseSpfRedirectLink("x.co.uk", [])).toBeNull();
  });
});
