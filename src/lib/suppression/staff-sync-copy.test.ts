import { describe, expect, it } from "vitest";

import {
  isSuppressionHeldShrinkLastError,
  suppressionConfirmRemovalButtonLabel,
  suppressionHeldShrinkCombinedStaffMessage,
  suppressionListShortenedWarning,
  suppressionReplaceRefusalMessage,
  suppressionStaffFacingSyncLastError,
} from "./staff-sync-copy";

const LEGACY_PARTIAL =
  "Sync stopped: the Sheet is missing 33 of the 205 addresses we already block. " +
  "The Sheet would load 172 addresses. Nothing was changed — all 205 stay blocked.";

const LEGACY_DOMAIN =
  "Sync stopped: the Sheet is missing 55 of the 302 domains we already block. " +
  "The Sheet would load 247 domains. Nothing was changed — all 302 stay blocked.";

describe("suppression staff sync copy", () => {
  it("refuses an empty sheet without jargon", () => {
    const msg = suppressionReplaceRefusalMessage("DOMAIN", 373, 0, 373);
    expect(msg).toContain("Sending continues");
    expect(msg).toContain("373");
    expect(msg).toContain("stay blocked");
    expect(msg).not.toContain("shrink");
    expect(msg).not.toContain("Remove them anyway");
    expect(msg).not.toContain("Sync stopped");
  });

  it("refuses a partial drop and does not invite a casual override", () => {
    const msg = suppressionReplaceRefusalMessage("EMAIL", 100, 80, 20);
    expect(msg).toContain("Sending continues");
    expect(msg).toContain("20");
    expect(msg).toContain("blocked to be safe");
    expect(msg).toContain("separate confirmation");
    expect(msg).not.toMatch(/Remove them anyway/i);
    expect(msg).not.toContain("Sync stopped");
  });

  it("warns after a confirmed shortened list", () => {
    const w = suppressionListShortenedWarning("EMAIL", 50, 1000);
    expect(w).toContain("950");
    expect(w).not.toContain("shrink");
  });

  it("labels the destructive confirm button plainly", () => {
    expect(suppressionConfirmRemovalButtonLabel(82)).toBe(
      "Yes — allow 82 to be contacted again",
    );
  });

  it("builds combined email + domain staff summary", () => {
    const msg = suppressionHeldShrinkCombinedStaffMessage({
      emailRemoved: 33,
      domainRemoved: 31,
    });
    expect(msg).toContain("Sending continues");
    expect(msg).toContain("33 emails");
    expect(msg).toContain("31 domains");
    expect(msg).toContain("check with the client first");
  });

  it("builds email-only and domain-only summaries", () => {
    expect(
      suppressionHeldShrinkCombinedStaffMessage({ emailRemoved: 1 }),
    ).toContain("1 email blocked");
    expect(
      suppressionHeldShrinkCombinedStaffMessage({ domainRemoved: 2 }),
    ).toContain("2 domains blocked");
  });

  it("detects held-shrink lastError including legacy Sync stopped refusals", () => {
    expect(isSuppressionHeldShrinkLastError(LEGACY_PARTIAL)).toBe(true);
    expect(
      isSuppressionHeldShrinkLastError("Google returned 403 — check sharing"),
    ).toBe(false);
    expect(
      isSuppressionHeldShrinkLastError(
        suppressionReplaceRefusalMessage("EMAIL", 100, 80, 20),
      ),
    ).toBe(true);
  });

  it("rewrites legacy held-shrink lastError for staff display", () => {
    const rewritten = suppressionStaffFacingSyncLastError("EMAIL", LEGACY_PARTIAL);
    expect(rewritten).toContain("Sending continues");
    expect(rewritten).toContain("33");
    expect(rewritten).not.toContain("Sync stopped");

    const domain = suppressionStaffFacingSyncLastError("DOMAIN", LEGACY_DOMAIN);
    expect(domain).toContain("55");
    expect(domain).toContain("domains");
  });
});
