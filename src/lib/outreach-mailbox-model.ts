import { DEFAULT_MAILBOX_DAILY_SEND_CAP, MAX_ACTIVE_MAILBOXES_PER_CLIENT } from "./mailbox-identities";

/** Minimal shape from mailbox readiness queries (avoid lib → server imports). */
export type MailboxReadinessSlice = {
  eligible: boolean;
  atLedgerCap: boolean;
  remaining: number;
};

/** OpensDoors: each fully onboarded client targets five connected outreach senders. */
export const REQUIRED_OUTREACH_MAILBOX_COUNT = MAX_ACTIVE_MAILBOXES_PER_CLIENT;

export const OUTREACH_MAILBOX_DAILY_CAP = DEFAULT_MAILBOX_DAILY_SEND_CAP;

/** 5 × 30 theoretical maximum when all mailboxes are connected and empty for the UTC day. */
export const THEORETICAL_MAX_CLIENT_DAILY_SENDS =
  REQUIRED_OUTREACH_MAILBOX_COUNT * OUTREACH_MAILBOX_DAILY_CAP;

/**
 * Sum of remaining ledger slots across mailboxes that are eligible to send (connection + not at ledger cap).
 */
export function sumAggregateRemainingAcrossEligible(
  readiness: MailboxReadinessSlice[],
): number {
  return readiness
    .filter((r) => r.eligible && !r.atLedgerCap)
    .reduce((acc, r) => acc + r.remaining, 0);
}

/**
 * Greedy pilot allocation: for each recipient, pick the mailbox with the most remaining slots,
 * breaking ties with primary-first, then id.
 * Returns per-target mailbox id or null if no slot was available when simulated.
 */
export function assignPilotTargetsToMailboxesGreedy(input: {
  targetCount: number;
  /** Mailbox id → remaining slots (>= 0) */
  remainingByMailboxId: Map<string, number>;
  /** Mailbox id → is primary */
  primaryByMailboxId: Map<string, boolean>;
}): { assignments: (string | null)[]; unassignedCount: number } {
  const { targetCount, remainingByMailboxId, primaryByMailboxId } = input;
  const state = new Map(remainingByMailboxId);

  function sortCandidates(): string[] {
    return [...state.keys()].sort((a, b) => {
      const ra = state.get(a) ?? 0;
      const rb = state.get(b) ?? 0;
      if (rb !== ra) return rb - ra;
      const pa = primaryByMailboxId.get(a) ? 1 : 0;
      const pb = primaryByMailboxId.get(b) ? 1 : 0;
      if (pb !== pa) return pb - pa;
      return a.localeCompare(b);
    });
  }

  const assignments: (string | null)[] = [];
  for (let i = 0; i < targetCount; i++) {
    const order = sortCandidates();
    const pick = order.find((id) => (state.get(id) ?? 0) > 0) ?? null;
    if (!pick) {
      assignments.push(null);
      continue;
    }
    assignments.push(pick);
    state.set(pick, Math.max(0, (state.get(pick) ?? 0) - 1));
  }

  const unassignedCount = assignments.filter((x) => x === null).length;
  return { assignments, unassignedCount };
}
