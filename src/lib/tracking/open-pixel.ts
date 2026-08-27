/**
 * Open tracking via a 1×1 pixel.
 *
 * We embed a hidden image in outgoing HTML emails pointing at
 * `/api/track/open/<correlationId>`. When the recipient's mail client loads
 * images, that endpoint records the first open time on the OutboundEmail.
 *
 * Caveat (surfaced in the UI): Apple Mail Privacy Protection pre-fetches
 * pixels (inflates opens) and many corporate clients block images
 * (suppresses opens). Open rates are therefore directional, not exact.
 */

import { resolvePublicBaseUrl } from "@/lib/unsubscribe/one-click-readiness";

/**
 * Values an operator may reasonably type into the Azure portal to mean "off".
 * Compared after trimming and lower-casing.
 */
const OFF_VALUES = new Set(["off", "false", "0", "no", "disabled"]);

/**
 * Deliverability kill-switch: set OPEN_TRACKING_PIXEL=off to stop embedding the pixel.
 *
 * This switch FAILS CLOSED on purpose. OpensDoors have been told in writing that
 * open tracking is off, so anything that plainly means off turns it off. The
 * previous exact-match check (`!== "off"`) silently RESUMED tracking if the
 * setting was ever typed as "OFF" or picked up a trailing space — a broken
 * written promise with no error, no log line and nothing on screen to catch it.
 * Azure's app-settings editor offers no validation, so the value is only ever
 * one careless keystroke away from that.
 */
export function isOpenTrackingPixelEnabled(): boolean {
  const raw = process.env.OPEN_TRACKING_PIXEL;
  if (raw === undefined) return true;
  return !OFF_VALUES.has(raw.trim().toLowerCase());
}

/**
 * Deliverability: when `OPEN_TRACKING_REQUIRE_ALIGNED_DOMAIN=on`, only embed the
 * open-tracking pixel for clients whose outreach links sit on a verified
 * sender-aligned domain (`go.<client-domain>`). For everyone else the pixel is
 * skipped rather than served from the OpensDoors app domain — a hidden 1×1 image
 * on a different host than the sender is a classic cold-bulk/phishing signal, and
 * for cold outreach that costs more deliverability than the open stats are worth.
 * Default off, so existing behaviour is unchanged until it is deliberately staged on.
 */
export function isOpenTrackingRequireAlignedDomain(): boolean {
  return process.env.OPEN_TRACKING_REQUIRE_ALIGNED_DOMAIN === "on";
}

/**
 * Absolute open-tracking pixel URL for an outbound email's correlationId.
 * Returns null when open tracking is disabled, or when no base URL is
 * available (so callers skip the pixel rather than emit a broken relative link).
 *
 * A hidden 1x1 image pointing at a domain that differs from the sender's is a
 * strong spam/phishing signal. When a client has a verified sender-aligned link
 * domain (`go.<client-domain>`), callers pass its base URL as `preferredBaseUrl`
 * so the pixel is served from the SAME domain family as the sender — clearing
 * the mismatch signal. Falls back to the tenant public base URL when no aligned
 * domain is available (e.g. internal/governed-test rows).
 */
export function buildOpenTrackingPixelUrl(
  correlationId: string,
  preferredBaseUrl?: string | null,
): string | null {
  if (!isOpenTrackingPixelEnabled()) return null;
  const id = correlationId?.trim();
  if (!id) return null;
  const preferred = preferredBaseUrl?.trim();
  const hasAligned = Boolean(preferred && preferred.length > 0);
  // When the aligned-domain rule is on, never emit a cross-domain pixel: skip it
  // entirely unless the client has a verified sender-aligned base URL.
  if (isOpenTrackingRequireAlignedDomain() && !hasAligned) return null;
  const base = (hasAligned ? preferred : resolvePublicBaseUrl())?.replace(/\/+$/, "");
  if (!base) return null;
  return `${base}/api/track/open/${encodeURIComponent(id)}`;
}

/** Append a hidden 1×1 tracking pixel to an HTML email body. */
export function appendOpenTrackingPixel(html: string, pixelUrl: string): string {
  const img =
    `<img src="${pixelUrl}" alt="" width="1" height="1" ` +
    `style="display:none;max-height:0;max-width:0;opacity:0;overflow:hidden" />`;
  return `${html}\n${img}`;
}
