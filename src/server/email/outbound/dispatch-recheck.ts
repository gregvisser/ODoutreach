import "server-only";

import { prisma } from "@/lib/db";
import {
  OUTREACH_COOLDOWN_DAYS,
  dateWhenEmailEligibleAgain,
  formatCooldownReason,
  isEmailInCooldown,
} from "@/lib/email-sequences/recent-send-cooldown";
import { isInternalSeedAddress } from "@/server/internal-seed/seed-allowlist";

/**
 * M2/M3 — dispatch-time re-check kill-switch.
 *
 * The 10-day workspace cooldown (M2) and the hard-bounce "recent send" fallback
 * (M3) are applied by the PLANNER (`step-sends.ts`) when a row is staged. A row
 * that then sits QUEUED for a while — a long retry backoff, or the manual
 * "prepare now, send later" path — is never re-evaluated against those at the
 * moment of dispatch. (Suppression / unsubscribe / DNC / hard-bounce-via-
 * suppression ARE already re-checked at dispatch by `evaluateSuppression` in
 * execute-one.ts; this closes only the remaining cooldown-timer gap and makes
 * the bounce protection independent of the `BOUNCE_SUPPRESSION_ENABLED` flag.)
 *
 * Default OFF (Prime Directive: send-path changes ship behind a flag). When
 * unset/false the dispatch path behaves exactly as before, so deploying this is
 * inert until `SEND_DISPATCH_RECHECK_ENABLED=true` is set deliberately.
 */
export function isDispatchRecheckEnabled(): boolean {
  return (
    (process.env.SEND_DISPATCH_RECHECK_ENABLED ?? "").trim().toLowerCase() ===
    "true"
  );
}

export type DispatchRecheckRecentSend = {
  lastSentAt: Date;
  eligibleAt: Date;
  bounced: boolean;
};

export type DispatchRecheckDecision =
  | { block: false }
  | {
      block: true;
      kind: "recent_bounce" | "cooldown";
      reason: string;
      eligibleAt: Date;
    };

/**
 * Pure mirror of the planner's cooldown/bounce branches
 * (`sequence-send-policy.ts` 1.5a + 1.5b):
 *   - a recent HARD bounce always blocks (never re-send a dead address), and is
 *     checked FIRST so it wins even past the cooldown timer;
 *   - otherwise an in-window recent send blocks until the window clears.
 *
 * No `bypassCooldown` here: the re-engage override is a plan-time operator
 * decision; a row that reaches dispatch has already passed it, and we never
 * want the dispatch backstop to wave a stale row through.
 */
export function decideDispatchRecheck(input: {
  now: Date;
  recentSend: DispatchRecheckRecentSend | null;
}): DispatchRecheckDecision {
  const r = input.recentSend;
  if (!r) return { block: false };
  if (r.bounced) {
    return {
      block: true,
      kind: "recent_bounce",
      reason: "Most recent send to this address hard-bounced — not re-sent.",
      eligibleAt: r.eligibleAt,
    };
  }
  if (isEmailInCooldown(r.lastSentAt, input.now)) {
    return {
      block: true,
      kind: "cooldown",
      reason: formatCooldownReason(r.lastSentAt),
      eligibleAt: r.eligibleAt,
    };
  }
  return { block: false };
}

/**
 * Load the most-recent in-window send to `toEmail` across the WHOLE workspace
 * (the cooldown is workspace-wide, across all clients), excluding this
 * outbound's own sequence so a follow-up step is never blocked by its own
 * introduction. Mirrors the planner query in `step-sends.ts`. Returns null when
 * there is no qualifying recent send.
 *
 * Runs only when the dispatch-recheck flag is on, and OpensDoors send volume is
 * low (per-mailbox daily caps), so the per-send cost is negligible.
 */
export async function loadDispatchRecentSend(input: {
  outboundEmailId: string;
  toEmail: string;
  now: Date;
}): Promise<DispatchRecheckRecentSend | null> {
  const normalized = input.toEmail.trim().toLowerCase();
  if (normalized.length === 0) return null;

  // Feature A — internal seed/allowlist addresses are always deliverable: no
  // cooldown and no recent-bounce block. Flag-gated (returns false when off).
  if (await isInternalSeedAddress(normalized)) return null;

  const cooldownStart = new Date(
    input.now.getTime() - OUTREACH_COOLDOWN_DAYS * 24 * 60 * 60 * 1000,
  );

  // This row's own sequence(s) — excluded so step-2 isn't blocked by step-1.
  // PK lookup on OutboundEmail, then its step-send FK; cheap.
  const self = await prisma.outboundEmail.findUnique({
    where: { id: input.outboundEmailId },
    select: { sequenceStepSends: { select: { sequenceId: true } } },
  });
  const ownSequenceIds = new Set(
    (self?.sequenceStepSends ?? []).map((s) => s.sequenceId),
  );

  const rows = await prisma.outboundEmail.findMany({
    where: {
      toEmail: { equals: normalized, mode: "insensitive" },
      sentAt: { gte: cooldownStart, not: null },
      id: { not: input.outboundEmailId },
    },
    select: {
      sentAt: true,
      status: true,
      sequenceStepSends: { select: { sequenceId: true } },
    },
    orderBy: { sentAt: "desc" },
  });

  let recent: DispatchRecheckRecentSend | null = null;
  for (const row of rows) {
    if (!row.sentAt) continue;
    const belongsToOwnSequence =
      ownSequenceIds.size > 0 &&
      row.sequenceStepSends.some((s) => ownSequenceIds.has(s.sequenceId));
    if (belongsToOwnSequence) continue;
    const isBounce = row.status === "BOUNCED";
    if (!recent) {
      // Rows are ordered newest-first, so the first qualifying row is the most
      // recent send; later rows only matter to surface a bounce.
      recent = {
        lastSentAt: row.sentAt,
        eligibleAt: dateWhenEmailEligibleAgain(row.sentAt),
        bounced: isBounce,
      };
    } else if (isBounce) {
      // Any hard bounce anywhere in the window marks the address.
      recent.bounced = true;
    }
  }
  return recent;
}

/** Convenience used by the dispatcher: load recent send + decide in one call. */
export async function evaluateOutboundDispatchRecheck(input: {
  outboundEmailId: string;
  toEmail: string;
  now: Date;
}): Promise<DispatchRecheckDecision> {
  const recentSend = await loadDispatchRecentSend(input);
  return decideDispatchRecheck({ now: input.now, recentSend });
}
