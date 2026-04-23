/**
 * Global branding helpers.
 *
 * Pure — no Prisma, no React. Used by:
 *   • the Settings → Branding form (client-side validation),
 *   • the `updateGlobalBrandAction` server action (validation),
 *   • the server-side `getGlobalBrand()` loader to merge stored values
 *     with the static OpensDoors defaults shipped in this repo.
 *
 * Fallback model
 * --------------
 * Every DB column is nullable. When a column is NULL we fall back to
 * `DEFAULT_BRAND` (the OpensDoors artwork and copy baked into this
 * repo). The favicon has a second-layer fallback to `appMarkUrl`
 * because most installations will re-use the monogram as the favicon.
 */

export const APP_LOGO_URL_MAX = 2048;
export const APP_MARK_URL_MAX = 2048;
export const APP_FAVICON_URL_MAX = 2048;
export const APP_BRAND_NAME_MAX = 64;
export const APP_PRODUCT_NAME_MAX = 64;
export const APP_LOGO_ALT_MAX = 200;

/**
 * Static OpensDoors defaults. These are the file-backed brand assets
 * shipped in the repo — used whenever a DB column is NULL or an admin
 * resets a field.
 */
export const DEFAULT_BRAND = {
  logoUrl: "/branding/opensdoors-logo.svg",
  markUrl: "/branding/opensdoors-mark.svg",
  faviconUrl: "/branding/opensdoors-mark.svg",
  brandName: "OpensDoors",
  productName: "Outreach",
  logoAltText: "OpensDoors Outreach",
} as const;

export type EffectiveBrand = {
  logoUrl: string;
  markUrl: string;
  faviconUrl: string;
  brandName: string;
  productName: string;
  logoAltText: string;
  /**
   * Per-field flag: true when the value was set by an admin (DB),
   * false when we fell back to the shipped default. Used by the
   * Settings UI to label "Custom" vs "Default" chips.
   */
  isCustom: {
    logoUrl: boolean;
    markUrl: boolean;
    faviconUrl: boolean;
    brandName: boolean;
    productName: boolean;
    logoAltText: boolean;
  };
};

export type GlobalBrandStored = {
  appLogoUrl: string | null;
  appMarkUrl: string | null;
  appFaviconUrl: string | null;
  appBrandName: string | null;
  appProductName: string | null;
  appLogoAltText: string | null;
};

/**
 * Merge stored DB values (any of which may be null) with the static
 * OpensDoors defaults and return the fully-resolved brand payload.
 *
 * Favicon fallback chain: `appFaviconUrl` → `appMarkUrl` →
 * `DEFAULT_BRAND.faviconUrl`. The logo alt-text default composes the
 * resolved brand + product names when not explicitly set.
 */
export function resolveEffectiveBrand(
  stored: GlobalBrandStored | null,
): EffectiveBrand {
  const logoUrl = stored?.appLogoUrl?.trim() || DEFAULT_BRAND.logoUrl;
  const markUrl = stored?.appMarkUrl?.trim() || DEFAULT_BRAND.markUrl;
  const faviconUrl =
    stored?.appFaviconUrl?.trim() ||
    stored?.appMarkUrl?.trim() ||
    DEFAULT_BRAND.faviconUrl;
  const brandName = stored?.appBrandName?.trim() || DEFAULT_BRAND.brandName;
  const productName =
    stored?.appProductName?.trim() || DEFAULT_BRAND.productName;
  const logoAltText =
    stored?.appLogoAltText?.trim() || `${brandName} ${productName}`;

  return {
    logoUrl,
    markUrl,
    faviconUrl,
    brandName,
    productName,
    logoAltText,
    isCustom: {
      logoUrl: Boolean(stored?.appLogoUrl?.trim()),
      markUrl: Boolean(stored?.appMarkUrl?.trim()),
      faviconUrl: Boolean(stored?.appFaviconUrl?.trim()),
      brandName: Boolean(stored?.appBrandName?.trim()),
      productName: Boolean(stored?.appProductName?.trim()),
      logoAltText: Boolean(stored?.appLogoAltText?.trim()),
    },
  };
}

export type GlobalBrandFormInput = {
  appLogoUrl: string;
  appMarkUrl: string;
  appFaviconUrl: string;
  appBrandName: string;
  appProductName: string;
  appLogoAltText: string;
};

export type GlobalBrandValidation =
  | {
      ok: true;
      normalized: GlobalBrandStored;
    }
  | {
      ok: false;
      field:
        | "appLogoUrl"
        | "appMarkUrl"
        | "appFaviconUrl"
        | "appBrandName"
        | "appProductName"
        | "appLogoAltText";
      message: string;
    };

/**
 * Validate a global branding form payload. Each URL must either be
 * blank (meaning "clear to default") or a full https:// URL (http://
 * is also accepted to keep local previews workable). Text fields are
 * bounded by their max lengths.
 */
export function validateGlobalBrandInput(
  input: GlobalBrandFormInput,
): GlobalBrandValidation {
  const logoUrl = input.appLogoUrl.trim();
  const markUrl = input.appMarkUrl.trim();
  const faviconUrl = input.appFaviconUrl.trim();
  const brandName = input.appBrandName.trim();
  const productName = input.appProductName.trim();
  const logoAltText = input.appLogoAltText.trim();

  const urlFields: Array<{
    field: "appLogoUrl" | "appMarkUrl" | "appFaviconUrl";
    value: string;
    max: number;
    label: string;
  }> = [
    { field: "appLogoUrl", value: logoUrl, max: APP_LOGO_URL_MAX, label: "App logo URL" },
    { field: "appMarkUrl", value: markUrl, max: APP_MARK_URL_MAX, label: "App icon URL" },
    {
      field: "appFaviconUrl",
      value: faviconUrl,
      max: APP_FAVICON_URL_MAX,
      label: "Favicon URL",
    },
  ];

  for (const { field, value, max, label } of urlFields) {
    if (value.length > max) {
      return {
        ok: false,
        field,
        message: `${label} must be ${String(max)} characters or fewer.`,
      };
    }
    if (value && !isAcceptableUrl(value)) {
      return {
        ok: false,
        field,
        message: `${label} must start with https:// (or http://), or be left blank to use the default.`,
      };
    }
  }

  if (brandName.length > APP_BRAND_NAME_MAX) {
    return {
      ok: false,
      field: "appBrandName",
      message: `Brand name must be ${String(APP_BRAND_NAME_MAX)} characters or fewer.`,
    };
  }
  if (productName.length > APP_PRODUCT_NAME_MAX) {
    return {
      ok: false,
      field: "appProductName",
      message: `Product name must be ${String(APP_PRODUCT_NAME_MAX)} characters or fewer.`,
    };
  }
  if (logoAltText.length > APP_LOGO_ALT_MAX) {
    return {
      ok: false,
      field: "appLogoAltText",
      message: `Logo alt text must be ${String(APP_LOGO_ALT_MAX)} characters or fewer.`,
    };
  }

  return {
    ok: true,
    normalized: {
      appLogoUrl: logoUrl.length > 0 ? logoUrl : null,
      appMarkUrl: markUrl.length > 0 ? markUrl : null,
      appFaviconUrl: faviconUrl.length > 0 ? faviconUrl : null,
      appBrandName: brandName.length > 0 ? brandName : null,
      appProductName: productName.length > 0 ? productName : null,
      appLogoAltText: logoAltText.length > 0 ? logoAltText : null,
    },
  };
}

/**
 * Accept relative paths that start with `/` so an admin can point at a
 * repo-served asset (e.g. `/branding/client-logo.svg`) in addition to
 * absolute https:// URLs. Anything else is rejected.
 */
function isAcceptableUrl(value: string): boolean {
  if (value.startsWith("/")) return true;
  return /^https?:\/\/.+/i.test(value);
}
