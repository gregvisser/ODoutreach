import { DEFAULT_MAILBOX_DAILY_SEND_CAP } from "@/lib/mailbox-identities";

/**
 * Organic mailbox warm-up ramp.
 *
 * Sending a brand-new mailbox's full daily volume on day one tanks
 * deliverability (spam foldering, provider throttling — the `550 5.1.8`
 * outbound blocks we saw). This ramps the *cold-outreach* daily volume from a
 * low base up to the mailbox's configured `dailySendCap` over ~3.5 weeks, so
 * reputation builds gradually.
 *
 * Scope (deliberate): applied only to the cold-outreach dispatch planners
 * (sequence introductions + controlled pilots). Replies and internal
 * proof/test sends are NOT throttled by warm-up — you must always be able to
 * reply to someone who engaged. The ledger reservation gate still enforces the
 * full configured `dailySendCap` as the hard ceiling for every send type.
 *
 * Safe + system-wide: gated by `MAILBOX_WARMUP_RAMP === "on"`. When off (the
 * default) every result equals the configured cap exactly, so behaviour is
 * byte-identical to before.
 *
 * ANCHOR CORRECTED 2026-08-24. This previously ramped on the mailbox's AGE
 * (`connectedAt`, else `createdAt`), and any mailbox older than the ramp window
 * was unaffected. That measured the wrong thing: a mailbox connected months ago
 * during onboarding and never used received its FULL daily allowance on its very
 * first send, with no ramp at all — which is precisely the mailbox this product
 * creates, since mailboxes are connected during setup and launched weeks later.
 *
 * Google conditions the rule on a history of SENDING, not on an account's age:
 * "Avoid introducing sudden volume spikes if you do not have a history of
 * sending large volumes." (https://support.google.com/a/answer/81126)
 *
 * So the ramp now counts DAYS THIS MAILBOX ACTUALLY SENT ON. The shape is
 * unchanged; only what is counted changed.
 */

/** Sends allowed on a mailbox's first day. */
export const WARMUP_BASE_CAP = 5;
/** Extra sends unlocked at each ramp step. */
export const WARMUP_STEP = 5;
/** Sending days between ramp steps: base 5, +5 every 5 → reaches 30 at 25 sending days. */
export const WARMUP_STEP_DAYS = 5;

const DAY_MS = 86_400_000;

/** Whether the organic warm-up ramp is active system-wide. Off unless explicitly enabled. */
export function isWarmupRampEnabled(): boolean {
  return process.env.MAILBOX_WARMUP_RAMP === "on";
}

/**
 * Whole days since the mailbox first became able to send (connectedAt, else
 * createdAt).
 *
 * NO LONGER DRIVES THE RAMP — see the note at the top of this file. Retained
 * because it is genuinely useful for display ("connected 12 days ago") and is
 * still a fair proxy for how long a mailbox has been *available*. Do not
 * reintroduce it as the warm-up anchor.
 */
export function mailboxAgeDays(
  mailbox: { connectedAt?: Date | null; createdAt: Date },
  now: Date,
): number {
  const anchor = mailbox.connectedAt ?? mailbox.createdAt;
  return Math.floor((now.getTime() - anchor.getTime()) / DAY_MS);
}

/**
 * Pure warm-up ceiling for a mailbox with a given amount of sending history,
 * never exceeding its steady (configured) cap. Flag-independent so it is
 * trivial to unit-test. The parameter is a COUNT OF SENDING DAYS, not an age.
 */
export function warmupDailyCap(steadyCap: number, sendingDays: number): number {
  const steady = Math.max(1, steadyCap);
  const days = Number.isFinite(sendingDays)
    ? Math.max(0, Math.floor(sendingDays))
    : 0;
  const ramped = WARMUP_BASE_CAP + WARMUP_STEP * Math.floor(days / WARMUP_STEP_DAYS);
  return Math.max(1, Math.min(steady, ramped));
}

/**
 * Effective per-mailbox daily cold-outreach cap.
 *
 * `sendingDays` is the number of distinct days this mailbox has actually sent
 * on — resolve it with `countMailboxSendingDays`. A mailbox that has never sent
 * passes 0 and starts at the bottom of the ramp no matter how long ago it was
 * connected. When warm-up is disabled this equals the configured cap exactly.
 */
export function effectiveDailyCap(
  mailbox: { dailySendCap: number; connectedAt?: Date | null; createdAt: Date },
  sendingDays: number,
): number {
  const steady = Math.max(
    1,
    mailbox.dailySendCap || DEFAULT_MAILBOX_DAILY_SEND_CAP,
  );
  if (!isWarmupRampEnabled()) return steady;
  return warmupDailyCap(steady, sendingDays);
}
