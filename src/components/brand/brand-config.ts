/**
 * Global OpensDoors brand assets served from /public/branding.
 *
 * These are the canonical URLs for the portal's global brand surface —
 * favicon, centered app logo, and Settings → Branding previews.
 *
 * To swap in updated artwork, replace the SVG files at these paths (or
 * add matching PNGs at the same base name) and the UI picks them up
 * automatically. Keep these URLs stable so deployments never break the
 * favicon or header logo.
 */
export const BRAND = {
  /** Horizontal "OpensDoors" wordmark used in the app header. */
  logoSrc: "/branding/opensdoors-logo.svg",
  /** OD monogram tile used as the favicon / small-size app icon. */
  markSrc: "/branding/opensdoors-mark.svg",
  /** Visible brand name — single source of truth for rendered text. */
  name: "OpensDoors",
  /** Short tagline paired with the logo. */
  product: "Outreach",
} as const;
