import { describe, expect, it } from "vitest";

import { isValidDomainFormat, suppressionDomainCandidates } from "@/lib/normalize";
import { normalizeManualDncEntry } from "./manual-dnc";

/**
 * A bare public suffix on a do-not-contact list blackholes an entire TLD.
 *
 * `suppressionDomainCandidates` walks every suffix down to two labels, so
 * `someone@acme.co.uk` yields `["acme.co.uk", "co.uk"]`. If the string `co.uk`
 * is ever stored as a suppressed domain for a client — one staff typo, one bad
 * cell in a synced Google Sheet — then EVERY `.co.uk` recipient for that client
 * matches and is silently marked BLOCKED_SUPPRESSION.
 *
 * Nothing stopped that row being stored: `isValidDomainFormat` is a shape check
 * (letters, digits, hyphens, at least one dot) and knows nothing about public
 * suffixes. `src/lib/normalize.ts` admits the gap in its own comment — "It does
 * NOT consult the Public Suffix List, so an explicitly stored multi-part suffix
 * (e.g. someone typing 'co.uk' into the sheet) would still over-block".
 *
 * This is the opposite failure from the one SIGNATURE-AND-DNC.md was worried
 * about. That brief was concerned with UNDER-blocking (`bt.com` not stopping
 * `bteurope.com`). This is silent, client-wide OVER-blocking, and it is live.
 *
 * Note this is NOT inference and does not touch RULING 3: refusing to store a
 * public suffix is rejecting an invalid entry, not guessing a relationship.
 */

describe("a bare public suffix must never reach the do-not-contact list", () => {
  it("REFUSES co.uk as a manual entry", () => {
    const result = normalizeManualDncEntry("DOMAIN", "co.uk");
    expect(result.ok).toBe(false);
  });

  it("REFUSES a bare TLD", () => {
    expect(normalizeManualDncEntry("DOMAIN", "com").ok).toBe(false);
    expect(normalizeManualDncEntry("DOMAIN", ".io").ok).toBe(false);
  });

  it("REFUSES the other multi-part suffixes a UK list would plausiblyhit", () => {
    for (const suffix of ["org.uk", "ac.uk", "gov.uk", "com.au", "co.nz"]) {
      expect(normalizeManualDncEntry("DOMAIN", suffix).ok).toBe(false);
    }
  });

  it("still ACCEPTS a real company domain on a multi-part suffix", () => {
    const result = normalizeManualDncEntry("DOMAIN", "bt.co.uk");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe("bt.co.uk");
  });

  it("still ACCEPTS an ordinary domain and a subdomain", () => {
    expect(normalizeManualDncEntry("DOMAIN", "bt.com").ok).toBe(true);
    expect(normalizeManualDncEntry("DOMAIN", "mail.bt.com").ok).toBe(true);
  });

  it("does not emit a bare public suffix as a match candidate", () => {
    // Even if a legacy row exists, matching must not widen to the whole TLD.
    expect(suppressionDomainCandidates("someone.acme.co.uk")).not.toContain("co.uk");
    expect(suppressionDomainCandidates("acme.co.uk")).not.toContain("co.uk");
    expect(suppressionDomainCandidates("acme.com")).not.toContain("com");
  });

  it("still matches the parent company domain, which is the point of the walk", () => {
    expect(suppressionDomainCandidates("newsletter.bt.com")).toContain("bt.com");
    expect(suppressionDomainCandidates("mail.bt.co.uk")).toContain("bt.co.uk");
  });

  it("the shape check alone was never enough — documents why", () => {
    // isValidDomainFormat is a SHAPE check and says yes to a public suffix.
    // That is why the guard has to be a separate, PSL-aware one.
    expect(isValidDomainFormat("co.uk")).toBe(true);
  });
});
