/**
 * Per-client open-tracking opt-in.
 *
 * Tracking is OFF for every client until that client is deliberately opted in,
 * and a client can only be opted in once their own `go.<domain>` is verified.
 *
 * Why this replaced the environment switch: `isOpenTrackingPixelEnabled()` is
 * global and returns TRUE unless somebody remembered to type `off` into the
 * Azure portal. OpensDoors have been told in writing that open tracking is off,
 * so that promise rested on one string in a text box with no validation, no
 * alarm and nothing on screen — and it applied to every client at once, so a
 * customer who DID want tracking could only be served by switching it back on
 * for everyone.
 *
 * The shape here is the customer's own words: off by default, and if a customer
 * agrees to change their DNS for tracking, they make the change and the toggle
 * is switched on for that customer alone.
 *
 * The DNS precondition is not bureaucracy. A hidden 1×1 image loaded from a
 * host that differs from the sender's domain is a classic cold-bulk/phishing
 * signal, and it is what got this client's outreach quarantined in 2026. Tying
 * the opt-in to a VERIFIED aligned domain means a tracked email can only ever
 * carry a same-domain pixel — the misalignment is impossible by construction
 * rather than prevented by a second flag someone has to remember to set.
 */

import {
  isClientLinkDomainReady,
  resolveClientLinkBaseUrl,
  type ClientLinkDomainFields,
} from "@/lib/clients/client-link-domain";

import { isOpenTrackingPixelEnabled } from "./open-pixel";

export type ClientOpenTrackingFields = ClientLinkDomainFields & {
  /** When staff opted this client into open tracking. Null = OFF (the default). */
  openTrackingEnabledAt: Date | null;
};

/** Prisma `select` for the fields an open-tracking decision needs. */
export const CLIENT_OPEN_TRACKING_SELECT = {
  outreachLinkDomain: true,
  outreachLinkDomainVerifiedAt: true,
  openTrackingEnabledAt: true,
} as const;

export type OpenTrackingOffReason =
  /** The global backstop (`OPEN_TRACKING_PIXEL=off`) is holding tracking off everywhere. */
  | "GLOBAL_KILL_SWITCH"
  /** The default. Nobody has switched tracking on for this client. */
  | "CLIENT_NOT_OPTED_IN"
  /** Opted in, but their aligned link domain is not (or no longer) verified. */
  | "LINK_DOMAIN_NOT_VERIFIED";

export type OpenTrackingDecision =
  | { enabled: true; baseUrl: string }
  | { enabled: false; reason: OpenTrackingOffReason };

/**
 * Whether this client's outreach may carry an open-tracking pixel, and the base
 * URL to serve it from. Every condition must hold; the first failure wins, so
 * the reason reported is the outermost thing standing in the way.
 */
export function decideClientOpenTracking(
  client: ClientOpenTrackingFields,
): OpenTrackingDecision {
  // Backstop first: when the global switch is off, nothing any client has opted
  // into matters. This is the only role the environment variable still plays.
  if (!isOpenTrackingPixelEnabled()) {
    return { enabled: false, reason: "GLOBAL_KILL_SWITCH" };
  }
  // DEFAULT OFF. A client with no setting gets no pixel.
  if (client.openTrackingEnabledAt == null) {
    return { enabled: false, reason: "CLIENT_NOT_OPTED_IN" };
  }
  // Re-checked at send time, not just at opt-in time: a link domain that was
  // verified in June can stop resolving in August, and the opt-in row would
  // happily outlive it.
  if (!isClientLinkDomainReady(client)) {
    return { enabled: false, reason: "LINK_DOMAIN_NOT_VERIFIED" };
  }
  const baseUrl = resolveClientLinkBaseUrl(client);
  if (!baseUrl) return { enabled: false, reason: "LINK_DOMAIN_NOT_VERIFIED" };
  return { enabled: true, baseUrl };
}

/**
 * Absolute open-tracking pixel URL for an outbound email, or null when this
 * client is not tracked. The client is a REQUIRED argument: there is no
 * global-only overload a call site could reach for by accident.
 */
export function buildOpenTrackingPixelUrlForClient(
  correlationId: string,
  client: ClientOpenTrackingFields,
): string | null {
  const decision = decideClientOpenTracking(client);
  if (!decision.enabled) return null;
  const id = correlationId?.trim();
  if (!id) return null;
  return `${decision.baseUrl}/api/track/open/${encodeURIComponent(id)}`;
}
