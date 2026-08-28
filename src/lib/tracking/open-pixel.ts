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

/**
 * Values an operator may reasonably type into the Azure portal to mean "off".
 * Compared after trimming and lower-casing.
 */
const OFF_VALUES = new Set(["off", "false", "0", "no", "disabled"]);

/**
 * GLOBAL KILL-SWITCH ONLY — this is a backstop, never the mechanism.
 *
 * Set `OPEN_TRACKING_PIXEL=off` to hold tracking off for every client at once,
 * regardless of what any of them have opted into. It cannot switch tracking
 * ON for anybody: that is decided per client by `decideClientOpenTracking`,
 * which defaults to OFF. Returning true here means only "the backstop is not
 * engaged", so an unset variable is safe.
 *
 * The switch FAILS CLOSED on purpose: anything that plainly means off turns it
 * off. An exact-match check (`!== "off"`) would silently resume tracking if the
 * setting were ever typed as "OFF" or picked up a trailing space, and Azure's
 * app-settings editor offers no validation.
 */
export function isOpenTrackingPixelEnabled(): boolean {
  const raw = process.env.OPEN_TRACKING_PIXEL;
  if (raw === undefined) return true;
  return !OFF_VALUES.has(raw.trim().toLowerCase());
}

/*
 * The pixel URL builder deliberately does NOT live here.
 *
 * A builder that takes only a correlationId can be called from anywhere without
 * naming a client, and the per-client opt-in would be one forgotten argument
 * away from being bypassed. `buildOpenTrackingPixelUrlForClient` in
 * ./client-open-tracking.ts requires the client, so a call site that has not
 * consulted the opt-in does not compile.
 *
 * `OPEN_TRACKING_REQUIRE_ALIGNED_DOMAIN` was removed with it. It existed to stop
 * a cross-domain pixel; the opt-in now requires a verified aligned domain, so a
 * cross-domain pixel is unreachable and the flag had nothing left to prevent.
 */

/** Append a hidden 1×1 tracking pixel to an HTML email body. */
export function appendOpenTrackingPixel(html: string, pixelUrl: string): string {
  const img =
    `<img src="${pixelUrl}" alt="" width="1" height="1" ` +
    `style="display:none;max-height:0;max-width:0;opacity:0;overflow:hidden" />`;
  return `${html}\n${img}`;
}
