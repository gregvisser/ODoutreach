/**
 * H5 (production hardening) — follow-up prerequisite hardening.
 *
 * Bug: in the dispatch transaction the previous step's `ClientEmailSequenceStepSend`
 * is flipped to SENT BEFORE the worker actually sends the email. If that send
 * later goes terminal FAILED, the stepSend stays SENT forever, so the follow-up
 * gate (which only reads the stepSend status) unlocks the next step and emails a
 * "just following up on my last email" to a prospect who never received the
 * intro.
 *
 * Fix: when this flag is ON, the follow-up gate additionally requires the
 * previous step's linked `OutboundEmail` to have ACTUALLY left our system
 * (status in the sent-with-proof set), not merely the stepSend flag.
 *
 * Pure + flag-gated: when OFF (default) the gate behaves exactly as before, so
 * deploying this is inert until the flag is deliberately enabled.
 */

/**
 * OutboundEmail statuses that mean "the message actually left our system".
 * BOUNCED is included — a bounce means it WAS sent (bounce handling /
 * suppression deals with that separately); the bug is specifically about
 * never-sent (FAILED / still-queued) intros unlocking a follow-up.
 */
export const OUTBOUND_ACTUALLY_SENT_STATUSES: ReadonlySet<string> = new Set([
  "SENT",
  "DELIVERED",
  "REPLIED",
  "BOUNCED",
]);

/**
 * True when the previous step's linked outbound actually sent. A null/undefined
 * status (no linked outbound, or it was deleted) counts as NOT sent — when the
 * flag is on we require positive proof before unlocking the follow-up.
 */
export function isIntroOutboundActuallySent(
  outboundStatus: string | null | undefined,
): boolean {
  return (
    typeof outboundStatus === "string" &&
    OUTBOUND_ACTUALLY_SENT_STATUSES.has(outboundStatus)
  );
}

export function isFollowupRequiresSentIntroEnabled(): boolean {
  return (
    (process.env.FOLLOWUP_REQUIRES_SENT_INTRO ?? "").trim().toLowerCase() ===
    "true"
  );
}
