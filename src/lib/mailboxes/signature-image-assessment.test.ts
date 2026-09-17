import { describe, expect, it } from "vitest";

import { assessSignatureImage } from "./signature-image-assessment";

describe("assessSignatureImage", () => {
  it("accepts a naturally scaled wide logo without calling the brand wrong", () => {
    const result = assessSignatureImage({
      intrinsicWidth: 1240,
      intrinsicHeight: 218,
      renderedWidth: 140,
      renderedHeight: 24.609375,
    });

    expect(result).toMatchObject({ distorted: false, unusuallySmall: true });
    expect(result?.message).toMatch(/may be hard to read/i);
    expect(result?.message).not.toMatch(/wrong|unsafe|deliverability|height:auto/i);
  });

  it("does not flag a wide but readable 341 by 100 logo as distorted", () => {
    const result = assessSignatureImage({
      intrinsicWidth: 341,
      intrinsicHeight: 100,
      renderedWidth: 140,
      renderedHeight: 41.0557,
    });

    expect(result).toMatchObject({ distorted: false, unusuallySmall: false, message: null });
  });

  it("flags fixed-height stretching with dimension guidance", () => {
    const result = assessSignatureImage({
      intrinsicWidth: 1240,
      intrinsicHeight: 218,
      renderedWidth: 140,
      renderedHeight: 70,
    });

    expect(result?.distorted).toBe(true);
    expect(result?.message).toMatch(/may be intentional|company-approved/i);
  });

  it("returns no opinion when the browser has not measured the image", () => {
    expect(
      assessSignatureImage({
        intrinsicWidth: 0,
        intrinsicHeight: 0,
        renderedWidth: 0,
        renderedHeight: 0,
      }),
    ).toBeNull();
  });
});
