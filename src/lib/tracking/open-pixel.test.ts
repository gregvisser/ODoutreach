import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { appendOpenTrackingPixel, isOpenTrackingPixelEnabled } from "./open-pixel";

/**
 * Pixel-URL construction moved to ./client-open-tracking.test.ts when the
 * builder gained a required client argument. What is left here is the global
 * backstop and the HTML fragment.
 */

describe("isOpenTrackingPixelEnabled", () => {
  const prevPixel = process.env.OPEN_TRACKING_PIXEL;

  beforeEach(() => {
    delete process.env.OPEN_TRACKING_PIXEL;
  });
  afterEach(() => {
    if (prevPixel === undefined) delete process.env.OPEN_TRACKING_PIXEL;
    else process.env.OPEN_TRACKING_PIXEL = prevPixel;
  });

  // The kill-switch must fail CLOSED. OpensDoors have been told in writing that
  // open tracking is off, so a value that plainly MEANS off — typed by an
  // operator in the Azure portal, where there is no validation and no feedback —
  // must never silently resume tracking. An exact-match check made "OFF" and
  // "off " (trailing space) turn the pixel back on with nothing to show for it.
  describe("the off switch fails closed", () => {
    const meansOff = [
      "off",
      "OFF",
      "Off",
      "oFf",
      " off",
      "off ",
      "  off  ",
      "false",
      "FALSE",
      "0",
      "no",
      "disabled",
    ];

    for (const value of meansOff) {
      it(`treats ${JSON.stringify(value)} as off`, () => {
        process.env.OPEN_TRACKING_PIXEL = value;
        expect(isOpenTrackingPixelEnabled()).toBe(false);
      });
    }
  });

  // "Not engaged" is not the same as "tracking is on". Whether any given client
  // is tracked is decided by decideClientOpenTracking, which defaults to OFF.
  it("reports the backstop as not engaged when unset or explicitly on", () => {
    expect(isOpenTrackingPixelEnabled()).toBe(true);
    process.env.OPEN_TRACKING_PIXEL = "on";
    expect(isOpenTrackingPixelEnabled()).toBe(true);
  });
});

describe("appendOpenTrackingPixel", () => {
  it("appends a hidden img with the pixel URL", () => {
    const out = appendOpenTrackingPixel(
      "<p>Hi</p>",
      "https://go.paratus365.com/api/track/open/x",
    );
    expect(out).toContain("<p>Hi</p>");
    expect(out).toContain('src="https://go.paratus365.com/api/track/open/x"');
    expect(out).toContain("display:none");
    expect(out).toContain('width="1"');
  });
});
