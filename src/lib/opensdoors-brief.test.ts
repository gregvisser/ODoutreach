import { describe, expect, it } from "vitest";

import {
  briefLooksFilled,
  mergeBriefIntoFormData,
  parseOpensDoorsBrief,
} from "./opensdoors-brief";

describe("parseOpensDoorsBrief / mergeBriefIntoFormData", () => {
  it("merges brief fields without dropping legacy keys", () => {
    const merged = mergeBriefIntoFormData(
      { emailSheetId: "abc123", extra: 1 },
      { businessAddress: "1 High St", offer: "Free audit" },
    );
    expect(merged.emailSheetId).toBe("abc123");
    expect(merged.extra).toBe(1);
    expect(merged.businessAddress).toBe("1 High St");
    expect(merged.offer).toBe("Free audit");
  });

  it("detects when brief has content", () => {
    expect(briefLooksFilled({})).toBe(false);
    expect(briefLooksFilled({ offer: "  x  " })).toBe(true);
  });

  it("parses known keys from formData", () => {
    const brief = parseOpensDoorsBrief({
      offer: "Hello",
      unknown: "ignored",
    });
    expect(brief.offer).toBe("Hello");
    expect((brief as Record<string, string>).unknown).toBeUndefined();
  });
});
