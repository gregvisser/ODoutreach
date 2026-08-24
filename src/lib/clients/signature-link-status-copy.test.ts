import { describe, expect, it, vi, afterEach } from "vitest";

import { signatureLinkStatusFor } from "./signature-link-alignment";

/**
 * Step 3 — the staff could not see any of this.
 *
 * The audit lived in a script nobody ran, and the mailbox panel rendered the
 * signature with no indication of where its links pointed. Greg found the defect
 * by noticing an unsubscribe link inside a signature during a customer meeting,
 * which is not a way to find defects.
 *
 * The brief's requirement, verbatim: "No codes, no severity letters. A sentence
 * a non-technical person can act on." These tests hold that line — they assert
 * on the WORDING, because the wording is the feature.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

const CLEAN = {
  email: "sam@trainhugger.com",
  senderSignatureHtml: '<div>Sam<a href="https://trainhugger.com">Train Hugger</a></div>',
  senderSignatureText: "Sam\nTrain Hugger",
};

describe("signature link status reads as plain English", () => {
  it("says it is safe to send when every link is the client's own", () => {
    vi.stubEnv("AUTH_URL", "https://opensdoors.bidlow.co.uk");
    const s = signatureLinkStatusFor(CLEAN);
    expect(s.tone).toBe("clean");
    expect(s.sentence).toBe("All links point to trainhugger.com — safe to send.");
  });

  it("says sending is BLOCKED, and names the host, when our app domain is in there", () => {
    vi.stubEnv("AUTH_URL", "https://opensdoors.bidlow.co.uk");
    const s = signatureLinkStatusFor({
      ...CLEAN,
      senderSignatureHtml:
        '<div>Sam<a href="https://opensdoors.bidlow.co.uk/unsubscribe/t">Unsubscribe</a></div>',
    });
    expect(s.tone).toBe("blocked");
    expect(s.sentence).toContain("opensdoors.bidlow.co.uk");
    expect(s.sentence).toContain("sending is blocked until this is removed");
  });

  it("warns without blocking on a logo hosted elsewhere", () => {
    vi.stubEnv("AUTH_URL", "https://opensdoors.bidlow.co.uk");
    const s = signatureLinkStatusFor({
      ...CLEAN,
      senderSignatureHtml:
        '<div>Sam<img src="https://cdn.prod.website-files.com/logo.svg"></div>',
    });
    expect(s.tone).toBe("warning");
    expect(s.sentence).toContain("usually a logo and usually fine");
  });

  it("never shows a severity letter or an internal code", () => {
    vi.stubEnv("AUTH_URL", "https://opensdoors.bidlow.co.uk");
    const cases = [
      CLEAN,
      { ...CLEAN, senderSignatureHtml: '<div>S<a href="https://opensdoors.bidlow.co.uk/u/t">x</a></div>' },
      { ...CLEAN, senderSignatureHtml: '<div>S<img src="https://cdn.example.net/l.png"></div>' },
    ];
    for (const c of cases) {
      const s = signatureLinkStatusFor(c);
      const allText = [s.sentence, ...s.details].join(" ");
      expect(allText).not.toMatch(/\b(HIGH|MEDIUM|LOW)\b/);
      expect(allText).not.toMatch(/blocked_[a-z_]+/);
      expect(allText).not.toMatch(/registrable|eTLD|PSL/i);
    }
  });

  it("lists several hosts readably rather than dumping an array", () => {
    vi.stubEnv("AUTH_URL", "https://opensdoors.bidlow.co.uk");
    const s = signatureLinkStatusFor({
      ...CLEAN,
      senderSignatureHtml:
        '<div>S<img src="https://a.example.net/1.png"><img src="https://b.example.org/2.png"></div>',
    });
    expect(s.sentence).toContain("example.net and example.org");
    expect(s.sentence).not.toContain("[");
  });

  it("an empty signature is clean, not an error", () => {
    vi.stubEnv("AUTH_URL", "https://opensdoors.bidlow.co.uk");
    const s = signatureLinkStatusFor({
      email: "sam@trainhugger.com",
      senderSignatureHtml: null,
      senderSignatureText: null,
    });
    expect(s.tone).toBe("clean");
    expect(s.details).toEqual([]);
  });
});
