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
 * byte-identical to before. Anchored to each mailbox's first send-capable date
 * (`connectedAt`, else `createdAt`), so any mailbox already older than the ramp
 * window is unaffected — its effective cap is its configured cap.
 */

/** Sends allowed on a mailbox's first day. */
export const WARMUP_BASE_CAP = 5;
/** Extra sends unlocked at each ramp step. */
export const WARMUP_STEP = 5;
/** Days between ramp steps: base 5, +5 every 5 days → reaches 30 at ~day 25 (~3.5 weeks). */
export const WARMUP_STEP_DAYS = 5;

const DAY_MS = 86_400_000;

/** Whether the organic warm-up ramp is active system-wide. Off unless explicitly enabled. */
export function isWarmupRampEnabled(): boolean {
  return process.env.MAILBOX_WARMUP_RAMP === "on";
}

/** Whole days since the mailbox first became able to send (connectedAt, else createdAt). */
export function mailboxAgeDays(
  mailbox: { connectedAt?: Date | null; createdAt: Date },
  now: Date,
): number {
  const anchor = mailbox.connectedAt ?? mailbox.createdAt;
  return Math.floor((now.getTime() - anchor.getTime()) / DAY_MS);
}

/**
 * Pure warm-up ceiling for a mailbox of a given age, never exceeding its steady
 * (configured) cap. Flag-independent so it is trivial to unit-test.
 */
export function warmupDailyCap(steadyCap: number, ageDays: number): number {
  const steady = Math.max(1, steadyCap);
  const day = Number.isFinite(ageDays) ? Math.max(0, Math.floor(ageDays)) : 0;
  const ramped = WARMUP_BASE_CAP + WARMUP_STEP * Math.floor(day / WARMUP_STEP_DAYS);
  return Math.max(1, Math.min(steady, ramped));
}

/**
 * Effective per-mailbox daily cold-outreach cap. When warm-up is enabled young
 * mailboxes ramp toward their configured `dailySendCap`; once past the ramp —
 * and for every mailbox when warm-up is disabled — this equals the configured
 * cap exactly (`Math.max(1, dailySendCap || DEFAULT)`).
 */
export function effectiveDailyCap(
  mailbox: { dailySendCap: number; connectedAt?: Date | null; createdAt: Date },
  now: Date,
): number {
  const steady = Math.max(
    1,
    mailbox.dailySendCap || DEFAULT_MAILBOX_DAILY_SEND_CAP,
  );
  if (!isWarmupRampEnabled()) return steady;
  return warmupDailyCap(steady, mailboxAgeDays(mailbox, now));
}
