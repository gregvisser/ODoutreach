/**
 * Bounce → suppression policy (pure).
 *
 * Two decisions live here, both side-effect free so they are trivially
 * unit-testable and shared between the webhook ingestion path and tests:
 *
 *   1. `classifyBounceHardness` — is a provider bounce a *hard* (permanent)
 *      bounce, a *soft* (transient) one, or *unknown*? Only hard bounces
 *      may add the recipient to the suppression list — a temporary mailbox-
 *      full / greylisting blip must never permanently suppress an address.
 *
 *   2. `isBounceSuppressionEnabled` — the feature flag gating the whole
 *      bounce-suppression behaviour. It is **opt-in / default-off**: this
 *      touches the suppression + send-eligibility path, so the code ships
 *      dormant and only activates once `BOUNCE_SUPPRESSION_ENABLED` is set
 *      in the runtime environment (Greg's sign-off — Prime Directive).
 *
 * Provider note (Resend / SES): `email.bounced` events carry a structured
 * bounce `type` of "Permanent" | "Transient" | "Undetermined". We classify
 * primarily on that type and fall back to scanning the stored category /
 * message text. "Undetermined" (or anything we can't read) stays `unknown`
 * and is treated as NON-suppressing — we only ever suppress on an explicit
 * permanent-failure signal.
 */

export type BounceHardness = "hard" | "soft" | "unknown";

/**
 * Classify a bounce as permanent (hard), transient (soft), or unknown.
 *
 * - `bounceType` is the provider's structured type (e.g. Resend/SES
 *   `bounce.type`). Preferred signal when present.
 * - `bounceCategory` is the value persisted on `OutboundEmail.bounceCategory`
 *   (the type, or a free-text message fallback). Used as a secondary signal.
 *
 * Matching is case-insensitive and substring-based so a message like
 * "Permanent failure: user unknown" still classifies as hard. We never
 * upgrade an ambiguous signal to hard — when in doubt, return `unknown`
 * and let the address remain sendable.
 */
export function classifyBounceHardness(input: {
  bounceType?: string | null;
  bounceCategory?: string | null;
}): BounceHardness {
  const signal = `${input.bounceType ?? ""} ${input.bounceCategory ?? ""}`
    .toLowerCase()
    .trim();

  if (signal.length === 0) return "unknown";

  // Permanent / hard — the mailbox or domain rejected us for good.
  if (signal.includes("permanent") || /\bhard\b/.test(signal)) {
    return "hard";
  }

  // Transient / soft — temporary (mailbox full, greylisting, throttling,
  // deferral). Never suppresses.
  if (
    signal.includes("transient") ||
    /\bsoft\b/.test(signal) ||
    signal.includes("temporary") ||
    signal.includes("deferred")
  ) {
    return "soft";
  }

  // "Undetermined" and everything else — ambiguous. Do NOT suppress.
  return "unknown";
}

/**
 * Feature flag for bounce-driven suppression. Default OFF — the behaviour
 * only switches on when `BOUNCE_SUPPRESSION_ENABLED` is set to a truthy
 * value ("true" / "1" / "on" / "yes", case-insensitive) in the runtime
 * environment. Shipping dormant keeps the suppression + send-eligibility
 * path unchanged until the change is signed off and the env var is set.
 */
export function isBounceSuppressionEnabled(): boolean {
  const raw = process.env.BOUNCE_SUPPRESSION_ENABLED?.trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "on" || raw === "yes";
}
