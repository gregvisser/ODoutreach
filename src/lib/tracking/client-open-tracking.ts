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
  isGoDomainAllowedForClient,
  resolveClientLinkBaseUrl,
  type ClientLinkDomainFields,
} from "@/lib/clients/client-link-domain";

import { isOpenTrackingPixelEnabled } from "./open-pixel";

export type ClientOpenTrackingFields = ClientLinkDomainFields & {
  /** When staff opted this client into open tracking. Null = OFF (the default). */
  openTrackingEnabledAt: Date | null;
  /**
   * When this system last RESOLVED this client's SPF, DKIM, DMARC and tracking
   * host and found all four correct. Null = never checked, which is OFF.
   *
   * Deliberately a timestamp and not a boolean. A boolean can only record that
   * something was once true, and DNS is not a fact — it is a lease. This field
   * has to answer "is it STILL true?", and that needs a date.
   */
  trackingDnsVerifiedAt: Date | null;
};

/** Prisma `select` for the fields an open-tracking decision needs. */
export const CLIENT_OPEN_TRACKING_SELECT = {
  outreachLinkDomain: true,
  outreachLinkDomainVerifiedAt: true,
  openTrackingEnabledAt: true,
  trackingDnsVerifiedAt: true,
} as const;

/**
 * How long a passing DNS verification counts for before tracking switches
 * itself off.
 *
 * This is the backstop that depends on nothing running. The scheduled re-check
 * is what NOTICES a regression — but if the schedule is the only thing that can
 * turn tracking off, then the day it quietly stops firing is the day every
 * client keeps tracking on for ever against DNS nobody is looking at. This
 * project has six recorded instances of something built, wired, reporting
 * success and never firing, so the safe state cannot rest on a scheduler.
 *
 * Seven days: long enough that a daily re-check has many chances to refresh it,
 * short enough that a dead scheduler closes the gate within a week.
 */
export const TRACKING_DNS_MAX_AGE_DAYS = 7;
const TRACKING_DNS_MAX_AGE_MS = TRACKING_DNS_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

export type OpenTrackingOffReason =
  /** The global backstop (`OPEN_TRACKING_PIXEL=off`) is holding tracking off everywhere. */
  | "GLOBAL_KILL_SWITCH"
  /** The default. Nobody has switched tracking on for this client. */
  | "CLIENT_NOT_OPTED_IN"
  /** Opted in, but their aligned link domain is not (or no longer) verified. */
  | "LINK_DOMAIN_NOT_VERIFIED"
  /** Their SPF/DKIM/DMARC/tracking-host records have never all passed a check. */
  | "EMAIL_AUTH_NOT_VERIFIED"
  /** They passed once, but too long ago for that to still be evidence. */
  | "EMAIL_AUTH_STALE";

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
  now: Date = new Date(),
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
  /*
    The inner gate. A verified `go.` host proves the LINK resolves to us; it says
    nothing about whether the domain's own email authentication is real, and a
    tracked email is judged on both — it gets quarantined for whichever one is
    missing. So SPF, DKIM and DMARC must have been RESOLVED and found correct by
    this system, never asserted by a person ticking a box.

    Ordered after the link-domain check on purpose: when both are broken, staff
    should be told to fix the host that does not exist yet, not sent chasing DNS
    records for it.
  */
  if (client.trackingDnsVerifiedAt == null) {
    return { enabled: false, reason: "EMAIL_AUTH_NOT_VERIFIED" };
  }
  if (now.getTime() - client.trackingDnsVerifiedAt.getTime() >= TRACKING_DNS_MAX_AGE_MS) {
    return { enabled: false, reason: "EMAIL_AUTH_STALE" };
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
  now: Date = new Date(),
): string | null {
  const decision = decideClientOpenTracking(client, now);
  if (!decision.enabled) return null;
  const id = correlationId?.trim();
  if (!id) return null;
  return `${decision.baseUrl}/api/track/open/${encodeURIComponent(id)}`;
}

/** Final send-time guard: client opt-in must also align with this sender. */
export function buildOpenTrackingPixelUrlForSender(
  correlationId: string,
  client: ClientOpenTrackingFields,
  senderEmail: string,
  now: Date = new Date(),
): string | null {
  if (!senderEmail.includes("@") ||
      !isGoDomainAllowedForClient(client.outreachLinkDomain ?? "", [senderEmail])) return null;
  return buildOpenTrackingPixelUrlForClient(correlationId, client, now);
}
