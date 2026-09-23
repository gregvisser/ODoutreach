import { describe, expect, it } from "vitest";

import {
  suppressionConfirmRemovalButtonLabel,
  suppressionListShortenedWarning,
  suppressionReplaceRefusalMessage,
} from "./staff-sync-copy";

describe("suppression staff sync copy", () => {
  it("refuses an empty sheet without jargon", () => {
    const msg = suppressionReplaceRefusalMessage("DOMAIN", 373, 0, 373);
    expect(msg).toContain("373");
    expect(msg).toContain("still blocked");
    expect(msg).not.toContain("shrink");
    expect(msg).not.toContain("Remove them anyway");
  });

  it("refuses a partial drop and does not invite a casual override", () => {
    const msg = suppressionReplaceRefusalMessage("EMAIL", 100, 80, 20);
    expect(msg).toContain("20");
    expect(msg).toContain("stay blocked");
    expect(msg).toContain("separate confirmation");
    expect(msg).not.toMatch(/Remove them anyway/i);
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
});
