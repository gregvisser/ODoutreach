/**
 * F3 — turn a launch's "why is nothing sendable?" into a precise, itemised
 * reason instead of a generic dead-end. When an old CSV is re-used, almost
 * every contact has already been emailed, so after the cooldown + suppression
 * checks there can be zero eligible recipients. Staff must see exactly why.
 *
 * Pure formatting only — the caller buckets the planned step-send rows by
 * their block reason and passes the counts in.
 */

export type IneligibilityBreakdown = {
  /** In the workspace-wide 10-day outreach cooldown. */
  cooldown: number;
  /** Unsubscribed or on the do-not-contact / suppression list. */
  suppressed: number;
  /** Hard-bounced previously. */
  bounced: number;
  /** No email address on file. */
  missingEmail: number;
  /** Already enrolled / already sent this step in another run. */
  alreadyEnrolled: number;
  /** Any other block reason not in the buckets above. */
  other: number;
};

export function emptyIneligibilityBreakdown(): IneligibilityBreakdown {
  return {
    cooldown: 0,
    suppressed: 0,
    bounced: 0,
    missingEmail: 0,
    alreadyEnrolled: 0,
    other: 0,
  };
}

/** Sum of every ineligible bucket. */
export function totalIneligible(b: IneligibilityBreakdown): number {
  return (
    b.cooldown +
    b.suppressed +
    b.bounced +
    b.missingEmail +
    b.alreadyEnrolled +
    b.other
  );
}

const LABELS: Array<{
  key: keyof IneligibilityBreakdown;
  one: string;
  many: string;
}> = [
  { key: "cooldown", one: "in cooldown", many: "in cooldown" },
  { key: "suppressed", one: "unsubscribed / do-not-contact", many: "unsubscribed / do-not-contact" },
  { key: "bounced", one: "hard-bounced", many: "hard-bounced" },
  { key: "missingEmail", one: "missing an email", many: "missing an email" },
  { key: "alreadyEnrolled", one: "already in a sequence", many: "already in a sequence" },
  { key: "other", one: "blocked", many: "blocked" },
];

/**
 * Itemised, human reason. Example:
 *   "480 in cooldown, 15 unsubscribed / do-not-contact, 5 hard-bounced → 0
 *    eligible to send right now."
 * Only non-zero buckets appear. When everything is eligible (or there is
 * simply nothing to report) returns null so the caller can fall back.
 */
export function formatIneligibilityReason(input: {
  breakdown: IneligibilityBreakdown;
  eligible: number;
}): string | null {
  const parts: string[] = [];
  for (const { key, one, many } of LABELS) {
    const n = input.breakdown[key];
    if (n > 0) parts.push(`${String(n)} ${n === 1 ? one : many}`);
  }
  if (parts.length === 0) return null;
  return `${parts.join(", ")} → ${String(input.eligible)} eligible to send right now.`;
}

/**
 * Map a step-send classification reason to an ineligibility bucket, or null
 * when the row is actually eligible (`ready`). Keeps the planner's reason
 * vocabulary in one place.
 */
export function bucketIneligibilityReason(
  reason: string,
): keyof IneligibilityBreakdown | null {
  switch (reason) {
    case "ready":
      return null;
    case "skipped_client_outreach_cooldown":
      return "cooldown";
    case "blocked_suppressed":
      return "suppressed";
    case "blocked_recent_bounce":
      return "bounced";
    case "blocked_missing_email":
      return "missingEmail";
    case "skipped_enrollment_completed":
    case "skipped_enrollment_excluded":
    case "skipped_enrollment_paused":
      return "alreadyEnrolled";
    default:
      return "other";
  }
}

/** Bucket a list of planned step-send reasons into a breakdown + eligible count. */
export function breakdownFromReasons(reasons: readonly string[]): {
  breakdown: IneligibilityBreakdown;
  eligible: number;
} {
  const breakdown = emptyIneligibilityBreakdown();
  let eligible = 0;
  for (const reason of reasons) {
    const bucket = bucketIneligibilityReason(reason);
    if (bucket === null) {
      eligible += 1;
      continue;
    }
    breakdown[bucket] += 1;
  }
  return { breakdown, eligible };
}
