import { describe, expect, it } from "vitest";

import {
  APP_BRAND_NAME_MAX,
  APP_LOGO_ALT_MAX,
  APP_LOGO_URL_MAX,
  APP_PRODUCT_NAME_MAX,
  DEFAULT_BRAND,
  resolveEffectiveBrand,
  validateGlobalBrandInput,
} from "./global-brand";

describe("resolveEffectiveBrand", () => {
  it("falls back to OpensDoors defaults when nothing is stored", () => {
    const b = resolveEffectiveBrand(null);
    expect(b.logoUrl).toBe(DEFAULT_BRAND.logoUrl);
    expect(b.markUrl).toBe(DEFAULT_BRAND.markUrl);
    expect(b.faviconUrl).toBe(DEFAULT_BRAND.faviconUrl);
    expect(b.brandName).toBe(DEFAULT_BRAND.brandName);
    expect(b.productName).toBe(DEFAULT_BRAND.productName);
    expect(b.logoAltText).toBe("OpensDoors Outreach");
    expect(b.isCustom).toEqual({
      logoUrl: false,
      markUrl: false,
      faviconUrl: false,
      brandName: false,
      productName: false,
      logoAltText: false,
    });
  });

  it("uses stored values when present and flags them as custom", () => {
    const b = resolveEffectiveBrand({
      appLogoUrl: "https://cdn.example/logo.png",
      appMarkUrl: "https://cdn.example/mark.png",
      appFaviconUrl: "https://cdn.example/favicon.ico",
      appBrandName: "Acme",
      appProductName: "Sales",
      appLogoAltText: "Acme Sales",
    });
    expect(b.logoUrl).toBe("https://cdn.example/logo.png");
    expect(b.markUrl).toBe("https://cdn.example/mark.png");
    expect(b.faviconUrl).toBe("https://cdn.example/favicon.ico");
    expect(b.brandName).toBe("Acme");
    expect(b.productName).toBe("Sales");
    expect(b.logoAltText).toBe("Acme Sales");
    expect(b.isCustom.logoUrl).toBe(true);
    expect(b.isCustom.faviconUrl).toBe(true);
  });

  it("falls back favicon → mark → default when favicon is null", () => {
    const b = resolveEffectiveBrand({
      appLogoUrl: null,
      appMarkUrl: "https://cdn.example/mark.png",
      appFaviconUrl: null,
      appBrandName: null,
      appProductName: null,
      appLogoAltText: null,
    });
    expect(b.faviconUrl).toBe("https://cdn.example/mark.png");
    expect(b.isCustom.faviconUrl).toBe(false);
    expect(b.isCustom.markUrl).toBe(true);
  });

  it("treats whitespace-only values as unset", () => {
    const b = resolveEffectiveBrand({
      appLogoUrl: "   ",
      appMarkUrl: "",
      appFaviconUrl: "\t\n",
      appBrandName: " ",
      appProductName: null,
      appLogoAltText: "",
    });
    expect(b.logoUrl).toBe(DEFAULT_BRAND.logoUrl);
    expect(b.brandName).toBe(DEFAULT_BRAND.brandName);
    expect(b.isCustom.logoUrl).toBe(false);
    expect(b.isCustom.brandName).toBe(false);
  });

  it("derives the alt text from stored brand + product when not explicit", () => {
    const b = resolveEffectiveBrand({
      appLogoUrl: null,
      appMarkUrl: null,
      appFaviconUrl: null,
      appBrandName: "Acme",
      appProductName: "Sales",
      appLogoAltText: null,
    });
    expect(b.logoAltText).toBe("Acme Sales");
    expect(b.isCustom.logoAltText).toBe(false);
  });
});

describe("validateGlobalBrandInput", () => {
  function blank() {
    return {
      appLogoUrl: "",
      appMarkUrl: "",
      appFaviconUrl: "",
      appBrandName: "",
      appProductName: "",
      appLogoAltText: "",
    };
  }

  it("accepts a fully blank payload (means 'reset to defaults')", () => {
    const result = validateGlobalBrandInput(blank());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalized).toEqual({
        appLogoUrl: null,
        appMarkUrl: null,
        appFaviconUrl: null,
        appBrandName: null,
        appProductName: null,
        appLogoAltText: null,
      });
    }
  });

  it("accepts https URLs and trims whitespace", () => {
    const result = validateGlobalBrandInput({
      ...blank(),
      appLogoUrl: "  https://cdn.example/logo.svg  ",
      appBrandName: "  Acme  ",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalized.appLogoUrl).toBe(
        "https://cdn.example/logo.svg",
      );
      expect(result.normalized.appBrandName).toBe("Acme");
    }
  });

  it("accepts repo-served absolute paths like /branding/…", () => {
    const result = validateGlobalBrandInput({
      ...blank(),
      appLogoUrl: "/branding/acme-logo.svg",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a non-URL logo value", () => {
    const result = validateGlobalBrandInput({
      ...blank(),
      appLogoUrl: "not-a-url",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe("appLogoUrl");
  });

  it("rejects a javascript: URL", () => {
    const result = validateGlobalBrandInput({
      ...blank(),
      appFaviconUrl: "javascript:alert(1)",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe("appFaviconUrl");
  });

  it("rejects a URL over the max length", () => {
    const result = validateGlobalBrandInput({
      ...blank(),
      appMarkUrl: `https://cdn.example/${"x".repeat(APP_LOGO_URL_MAX)}`,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe("appMarkUrl");
  });

  it("rejects a brand name over the max length", () => {
    const result = validateGlobalBrandInput({
      ...blank(),
      appBrandName: "x".repeat(APP_BRAND_NAME_MAX + 1),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe("appBrandName");
  });

  it("rejects a product name over the max length", () => {
    const result = validateGlobalBrandInput({
      ...blank(),
      appProductName: "x".repeat(APP_PRODUCT_NAME_MAX + 1),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe("appProductName");
  });

  it("rejects alt text over the max length", () => {
    const result = validateGlobalBrandInput({
      ...blank(),
      appLogoAltText: "x".repeat(APP_LOGO_ALT_MAX + 1),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe("appLogoAltText");
  });
});
