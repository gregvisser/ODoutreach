import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { appendOpenTrackingPixel, buildOpenTrackingPixelUrl } from "./open-pixel";

describe("buildOpenTrackingPixelUrl", () => {
  const prevAuth = process.env.AUTH_URL;
  const prevInternal = process.env.INTERNAL_APP_URL;
  const prevPublic = process.env.NEXT_PUBLIC_APP_URL;
  const prevPixel = process.env.OPEN_TRACKING_PIXEL;
  const prevAligned = process.env.OPEN_TRACKING_REQUIRE_ALIGNED_DOMAIN;

  beforeEach(() => {
    delete process.env.AUTH_URL;
    delete process.env.INTERNAL_APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.OPEN_TRACKING_PIXEL;
    delete process.env.OPEN_TRACKING_REQUIRE_ALIGNED_DOMAIN;
  });
  afterEach(() => {
    process.env.AUTH_URL = prevAuth;
    process.env.INTERNAL_APP_URL = prevInternal;
    process.env.NEXT_PUBLIC_APP_URL = prevPublic;
    if (prevPixel === undefined) delete process.env.OPEN_TRACKING_PIXEL;
    else process.env.OPEN_TRACKING_PIXEL = prevPixel;
    if (prevAligned === undefined)
      delete process.env.OPEN_TRACKING_REQUIRE_ALIGNED_DOMAIN;
    else process.env.OPEN_TRACKING_REQUIRE_ALIGNED_DOMAIN = prevAligned;
  });

  it("returns null when open tracking is disabled via OPEN_TRACKING_PIXEL=off", () => {
    process.env.AUTH_URL = "https://app.example.com";
    process.env.OPEN_TRACKING_PIXEL = "off";
    expect(buildOpenTrackingPixelUrl("corr-123")).toBeNull();
  });

  it("builds an absolute pixel URL from the public base URL", () => {
    process.env.AUTH_URL = "https://app.example.com";
    expect(buildOpenTrackingPixelUrl("corr-123")).toBe(
      "https://app.example.com/api/track/open/corr-123",
    );
  });

  it("strips a trailing slash on the base URL", () => {
    process.env.AUTH_URL = "https://app.example.com/";
    expect(buildOpenTrackingPixelUrl("corr-123")).toBe(
      "https://app.example.com/api/track/open/corr-123",
    );
  });

  it("returns null when no base URL is configured", () => {
    expect(buildOpenTrackingPixelUrl("corr-123")).toBeNull();
  });

  it("returns null for an empty correlationId", () => {
    process.env.AUTH_URL = "https://app.example.com";
    expect(buildOpenTrackingPixelUrl("  ")).toBeNull();
  });

  it("url-encodes the correlationId", () => {
    process.env.AUTH_URL = "https://app.example.com";
    expect(buildOpenTrackingPixelUrl("a/b c")).toBe(
      "https://app.example.com/api/track/open/a%2Fb%20c",
    );
  });

  it("prefers a client-aligned base URL over the public base URL", () => {
    process.env.AUTH_URL = "https://app.example.com";
    expect(
      buildOpenTrackingPixelUrl("corr-123", "https://go.paratus365.com"),
    ).toBe("https://go.paratus365.com/api/track/open/corr-123");
  });

  it("strips a trailing slash on the aligned base URL", () => {
    process.env.AUTH_URL = "https://app.example.com";
    expect(
      buildOpenTrackingPixelUrl("corr-123", "https://go.paratus365.com/"),
    ).toBe("https://go.paratus365.com/api/track/open/corr-123");
  });

  it("falls back to the public base URL when the aligned base is empty/null", () => {
    process.env.AUTH_URL = "https://app.example.com";
    expect(buildOpenTrackingPixelUrl("corr-123", null)).toBe(
      "https://app.example.com/api/track/open/corr-123",
    );
    expect(buildOpenTrackingPixelUrl("corr-123", "   ")).toBe(
      "https://app.example.com/api/track/open/corr-123",
    );
  });

  it("stays disabled even when an aligned base URL is passed", () => {
    process.env.AUTH_URL = "https://app.example.com";
    process.env.OPEN_TRACKING_PIXEL = "off";
    expect(
      buildOpenTrackingPixelUrl("corr-123", "https://go.paratus365.com"),
    ).toBeNull();
  });

  describe("OPEN_TRACKING_REQUIRE_ALIGNED_DOMAIN", () => {
    it("skips the pixel when on and the client has no aligned domain (no cross-domain pixel)", () => {
      process.env.AUTH_URL = "https://app.example.com";
      process.env.OPEN_TRACKING_REQUIRE_ALIGNED_DOMAIN = "on";
      expect(buildOpenTrackingPixelUrl("corr-123")).toBeNull();
      expect(buildOpenTrackingPixelUrl("corr-123", null)).toBeNull();
      expect(buildOpenTrackingPixelUrl("corr-123", "   ")).toBeNull();
    });

    it("still emits the pixel when on and an aligned domain IS set", () => {
      process.env.AUTH_URL = "https://app.example.com";
      process.env.OPEN_TRACKING_REQUIRE_ALIGNED_DOMAIN = "on";
      expect(
        buildOpenTrackingPixelUrl("corr-123", "https://go.paratus365.com"),
      ).toBe("https://go.paratus365.com/api/track/open/corr-123");
    });

    it("is off by default — an unaligned client still gets the public-domain pixel", () => {
      process.env.AUTH_URL = "https://app.example.com";
      expect(buildOpenTrackingPixelUrl("corr-123")).toBe(
        "https://app.example.com/api/track/open/corr-123",
      );
    });
  });
});

describe("appendOpenTrackingPixel", () => {
  it("appends a hidden img with the pixel URL", () => {
    const out = appendOpenTrackingPixel(
      "<p>Hi</p>",
      "https://app.example.com/api/track/open/x",
    );
    expect(out).toContain("<p>Hi</p>");
    expect(out).toContain(
      'src="https://app.example.com/api/track/open/x"',
    );
    expect(out).toContain("display:none");
    expect(out).toContain('width="1"');
  });
});
