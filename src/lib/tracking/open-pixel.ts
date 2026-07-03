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

/** Deliverability kill-switch: set OPEN_TRACKING_PIXEL=off to stop embedding the pixel. */
export function isOpenTrackingPixelEnabled(): boolean {
  return process.env.OPEN_TRACKING_PIXEL !== "off";
}

/**
 * Absolute open-tracking pixel URL for an outbound email's correlationId.
 * Returns null when open tracking is disabled, or when no public base URL is
 * configured (so callers skip the pixel rather than emit a broken relative link).
 *
 * A hidden 1x1 image pointing at a domain that differs from the sender's is a
 * strong spam/phishing signal, so this can be switched off tenant-wide while
 * outreach links are being moved onto sender-aligned domains.
 */
export function buildOpenTrackingPixelUrl(correlationId: string): string | null {
  if (!isOpenTrackingPixelEnabled()) return null;
  const id = correlationId?.trim();
  if (!id) return null;
  const base = resolvePublicBaseUrl();
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
