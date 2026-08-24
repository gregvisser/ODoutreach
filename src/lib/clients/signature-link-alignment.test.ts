import { describe, expect, it, vi, afterEach } from "vitest";

import {
  appDomainsFromEnv,
  extractLinks,
  findMisalignedLinks,
  hasBlockingFinding,
  mailboxSignatureFindings,
  ownDomainsFor,
  registrableDomainOf,
  severityForLink,
  type AlignmentContext,
} from "./signature-link-alignment";

/**
 * Link alignment — Bidlow's own rule, earned from the 2026 quarantine. It is not
 * an external standard and is not presented as one here.
 *
 * These tests pin the two places this module DELIBERATELY DISAGREES with
 * `scripts/ops-cross-domain-audit.ts`, because both disagreements were found by
 * running that script against production on 2026-08-24 and reading the result:
 *
 *   1. A remote image on a foreign host is MEDIUM, not HIGH. The script's rule
 *      produced 11 HIGH findings and every one was a company logo — including
 *      Train Hugger's own logo on Webflow's asset CDN. Blocking on that would
 *      have stopped the largest client (763 sends) for hosting its logo the
 *      normal way.
 *   2. Well-known hosts are checked BEFORE image-ness. The script tested
 *      `isImage` first, so a LinkedIn icon — an image on linkedin.com — scored
 *      HIGH. Any signature with social icons would have blocked.
 */

const ctx = (own: string[], app: string[] = ["opensdoors.bidlow.co.uk"]): AlignmentContext => ({
  ownDomains: new Set(own),
  appDomains: new Set(app),
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("registrableDomainOf uses the real Public Suffix List", () => {
  it("resolves multi-part suffixes the hand-rolled list would miss", () => {
    // The script's 16-entry array happened to include co.uk. These do not
    // appear in it, and a misresolved suffix produces a FALSE CLEAN.
    expect(registrableDomainOf("shop.example.co.za")).toBe("example.co.za");
    expect(registrableDomainOf("mail.example.com.sg")).toBe("example.com.sg");
    expect(registrableDomainOf("a.b.example.gov.au")).toBe("example.gov.au");
  });

  it("collapses subdomains to the registrable domain", () => {
    expect(registrableDomainOf("mail.bt.com")).toBe("bt.com");
    expect(registrableDomainOf("www.bt.com")).toBe("bt.com");
    expect(registrableDomainOf("bt.co.uk")).toBe("bt.co.uk");
  });

  it("accepts a full URL as well as a bare host", () => {
    expect(registrableDomainOf("https://go.trainhugger.com/unsubscribe/x")).toBe(
      "trainhugger.com",
    );
  });

  it("keeps separate projects on a shared platform separate", () => {
    // allowPrivateDomains: two Supabase projects are not the same origin.
    expect(registrableDomainOf("aaa.supabase.co")).not.toBe(
      registrableDomainOf("bbb.supabase.co"),
    );
  });

  it("returns null rather than guessing when it cannot resolve", () => {
    expect(registrableDomainOf(null)).toBeNull();
    expect(registrableDomainOf("")).toBeNull();
    expect(registrableDomainOf("not a host")).toBeNull();
  });
});

describe("extractLinks", () => {
  it("marks src as an image and href as a link", () => {
    const links = extractLinks(
      '<a href="https://example.com/a"><img src="https://cdn.example.net/logo.png" /></a>',
      "signature HTML",
    );
    expect(links).toHaveLength(2);
    expect(links.find((l) => l.url.endsWith("logo.png"))?.isImage).toBe(true);
    expect(links.find((l) => l.url.endsWith("/a"))?.isImage).toBe(false);
  });

  it("does not report the same URL twice when both passes match it", () => {
    // The bare-URL pass sees the same string as the attribute pass. Counting it
    // twice would inflate every logo into an image AND a link.
    const links = extractLinks('<img src="https://cdn.example.net/l.png">', "sig");
    expect(links).toHaveLength(1);
    expect(links[0]?.isImage).toBe(true);
  });

  it("ignores non-http schemes", () => {
    expect(extractLinks('<a href="mailto:a@b.com">x</a>', "sig")).toHaveLength(0);
  });

  it("survives empty and unparseable input", () => {
    expect(extractLinks(null, "sig")).toEqual([]);
    expect(extractLinks("", "sig")).toEqual([]);
  });
});

describe("severity — the two corrections to the original script", () => {
  it("a LinkedIn ICON is LOW, not HIGH — well-known beats image-ness", () => {
    const [link] = extractLinks(
      '<img src="https://linkedin.com/icon.png">',
      "signature HTML",
    );
    expect(link).toBeDefined();
    expect(severityForLink(link!, ctx(["clientdomain.co.uk"]))).toBe("LOW");
  });

  it("a company logo on a third-party CDN is MEDIUM, not HIGH", () => {
    // Train Hugger's real case: its own logo on Webflow's asset host.
    const [link] = extractLinks(
      '<img src="https://cdn.prod.website-files.com/abc/TH-Logo.svg">',
      "signature HTML",
    );
    expect(severityForLink(link!, ctx(["trainhugger.com"]))).toBe("MEDIUM");
  });

  it("the OpensDoors app domain is HIGH — the actual quarantine pattern", () => {
    const [link] = extractLinks(
      '<a href="https://opensdoors.bidlow.co.uk/unsubscribe/tok">Unsubscribe</a>',
      "signature HTML",
    );
    expect(severityForLink(link!, ctx(["trainhugger.com"]))).toBe("HIGH");
  });

  it("a link on the client's OWN domain produces no finding at all", () => {
    const [link] = extractLinks(
      '<a href="https://go.trainhugger.com/x">More</a>',
      "signature HTML",
    );
    expect(severityForLink(link!, ctx(["trainhugger.com"]))).toBeNull();
  });

  it("does NOT flag a client whose own domain the app also runs on", () => {
    // Caught by running against production. BidlowAI is itself a workspace, its
    // mailbox is greg@bidlow.co.uk, and the app runs at opensdoors.bidlow.co.uk.
    // An earlier revision reduced the app URL to its registrable domain and
    // checked it BEFORE alignment, so BidlowAI's links to its own marketing site
    // scored HIGH and would have blocked its own sends.
    const links = extractLinks(
      '<div>Greg<img src="https://www.bidlow.co.uk/brand/logo-mark-1024.png"><a href="https://www.bidlow.co.uk/">Bidlow</a></div>',
      "signature HTML",
    );
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(severityForLink(link, ctx(["bidlow.co.uk"]))).toBeNull();
    }
  });

  it("still flags the app HOST for a client that merely shares the zone", () => {
    const [link] = extractLinks(
      '<a href="https://opensdoors.bidlow.co.uk/unsubscribe/t">Unsubscribe</a>',
      "signature HTML",
    );
    // trainhugger.com does not own bidlow.co.uk, so this is our host in their mail.
    expect(severityForLink(link!, ctx(["trainhugger.com"]))).toBe("HIGH");
  });

  it("azurewebsites.net is treated as ours", () => {
    const [link] = extractLinks(
      '<img src="https://app-opensdoors-outreach-prod.azurewebsites.net/p.gif">',
      "signature HTML",
    );
    const c: AlignmentContext = {
      ownDomains: new Set(["trainhugger.com"]),
      appDomains: new Set(["azurewebsites.net"]),
    };
    expect(severityForLink(link!, c)).toBe("HIGH");
  });
});

describe("hasBlockingFinding — only HIGH blocks", () => {
  it("does not block on a foreign logo", () => {
    const findings = findMisalignedLinks(
      '<img src="https://cdn.prod.website-files.com/logo.svg">',
      "signature HTML",
      ctx(["trainhugger.com"]),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("MEDIUM");
    expect(hasBlockingFinding(findings)).toBe(false);
  });

  it("blocks on the app domain", () => {
    const findings = findMisalignedLinks(
      '<a href="https://opensdoors.bidlow.co.uk/unsubscribe/x">Unsubscribe</a>',
      "signature HTML",
      ctx(["trainhugger.com"]),
    );
    expect(hasBlockingFinding(findings)).toBe(true);
  });

  it("gives a reason a non-technical operator can act on", () => {
    const [finding] = findMisalignedLinks(
      '<a href="https://opensdoors.bidlow.co.uk/u/x">Unsubscribe</a>',
      "signature HTML",
      ctx(["trainhugger.com"]),
    );
    // No codes, no severity letters — Step 3 renders this verbatim.
    expect(finding?.reason).toContain("OpensDoors system's own address");
    expect(finding?.reason).not.toMatch(/HIGH|MEDIUM|LOW/);
  });
});

describe("ownDomainsFor / appDomainsFromEnv", () => {
  it("derives the client's domains from mailbox addresses and settings", () => {
    const own = ownDomainsFor({
      mailboxEmails: ["sam@trainhugger.com", "joe@trainhugger.com"],
      website: "https://www.trainhugger.com/about",
      outreachLinkDomain: "go.trainhugger.com",
    });
    expect([...own]).toEqual(["trainhugger.com"]);
  });

  it("reads the platform's own domains from the environment", () => {
    vi.stubEnv("AUTH_URL", "https://opensdoors.bidlow.co.uk");
    const app = appDomainsFromEnv();
    // EXACT host, not the registrable domain — see the note on appDomainsFromEnv.
    expect(app.has("opensdoors.bidlow.co.uk")).toBe(true);
    expect(app.has("bidlow.co.uk")).toBe(false);
    // Always present regardless of env — the App Service default hostname.
    expect(app.has("azurewebsites.net")).toBe(true);
  });
});

describe("mailboxSignatureFindings — the surface sent verbatim", () => {
  const mailbox = {
    email: "sam@trainhugger.com",
    senderSignatureHtml:
      '<div>Sam<br><img src="https://cdn.prod.website-files.com/logo.svg"><a href="https://linkedin.com/in/sam">LinkedIn</a></div>',
    senderSignatureText: "Sam\nTrain Hugger",
  };

  it("does NOT block a real-world signature of a logo plus a LinkedIn link", () => {
    vi.stubEnv("AUTH_URL", "https://opensdoors.bidlow.co.uk");
    const findings = mailboxSignatureFindings(mailbox);
    expect(hasBlockingFinding(findings)).toBe(false);
    expect(findings.map((f) => f.severity).sort()).toEqual(["LOW", "MEDIUM"]);
  });

  it("blocks when the signature carries our own app domain", () => {
    vi.stubEnv("AUTH_URL", "https://opensdoors.bidlow.co.uk");
    const findings = mailboxSignatureFindings({
      ...mailbox,
      senderSignatureHtml:
        '<div>Sam<a href="https://opensdoors.bidlow.co.uk/unsubscribe/t">Unsubscribe</a></div>',
    });
    expect(hasBlockingFinding(findings)).toBe(true);
  });

  it("scans the plain-text signature too, not just the HTML", () => {
    vi.stubEnv("AUTH_URL", "https://opensdoors.bidlow.co.uk");
    const findings = mailboxSignatureFindings({
      email: "sam@trainhugger.com",
      senderSignatureHtml: null,
      senderSignatureText: "Sam\nUnsubscribe: https://opensdoors.bidlow.co.uk/u/t",
    });
    expect(hasBlockingFinding(findings)).toBe(true);
    expect(findings[0]?.where).toBe("signature text");
  });

  it("an empty signature produces no findings", () => {
    expect(
      mailboxSignatureFindings({
        email: "sam@trainhugger.com",
        senderSignatureHtml: null,
        senderSignatureText: null,
      }),
    ).toEqual([]);
  });
});
