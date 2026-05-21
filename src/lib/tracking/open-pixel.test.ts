import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { appendOpenTrackingPixel, buildOpenTrackingPixelUrl } from "./open-pixel";

describe("buildOpenTrackingPixelUrl", () => {
  const prevAuth = process.env.AUTH_URL;
  const prevInternal = process.env.INTERNAL_APP_URL;
  const prevPublic = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(() => {
    delete process.env.AUTH_URL;
    delete process.env.INTERNAL_APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
  });
  afterEach(() => {
    process.env.AUTH_URL = prevAuth;
    process.env.INTERNAL_APP_URL = prevInternal;
    process.env.NEXT_PUBLIC_APP_URL = prevPublic;
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
