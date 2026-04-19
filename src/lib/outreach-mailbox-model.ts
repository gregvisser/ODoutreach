import { DEFAULT_MAILBOX_DAILY_SEND_CAP, MAX_ACTIVE_MAILBOXES_PER_CLIENT } from "./mailbox-identities";

/** Minimal shape from mailbox readiness queries (avoid lib → server imports). */
export type MailboxReadinessSlice = {
  eligible: boolean;
  atLedgerCap: boolean;
  remaining: number;
};

/**
 * Recommended maximum: up to this many connected eligible sending mailboxes for the highest pooled
 * daily capacity (5 × per-mailbox cap). Fewer mailboxes still allow onboarding, pilot, and production
 * sends at reduced total capacity.
 */
export const REQUIRED_OUTREACH_MAILBOX_COUNT = MAX_ACTIVE_MAILBOXES_PER_CLIENT;

export const OUTREACH_MAILBOX_DAILY_CAP = DEFAULT_MAILBOX_DAILY_SEND_CAP;

/** 5 × 30 theoretical maximum when five eligible mailboxes are connected and empty for the UTC day. */
export const THEORETICAL_MAX_CLIENT_DAILY_SENDS =
  REQUIRED_OUTREACH_MAILBOX_COUNT * OUTREACH_MAILBOX_DAILY_CAP;

export type OutreachMailboxCapacityTier = "none" | "reduced" | "max_recommended";

/** Eligible = connected sending mailboxes (same notion as checklist / pilot counts). */
export function getOutreachMailboxCapacityTier(
  connectedEligibleCount: number,
): OutreachMailboxCapacityTier {
  if (connectedEligibleCount <= 0) return "none";
  if (connectedEligibleCount >= REQUIRED_OUTREACH_MAILBOX_COUNT) return "max_recommended";
  return "reduced";
}

/** Copy for the A–Z launch checklist “Outreach mailbox capacity” row. */
export function formatOutreachMailboxCapacityChecklistDetail(
  connectedEligibleCount: number,
): string {
  const max = REQUIRED_OUTREACH_MAILBOX_COUNT;
  const tier = getOutreachMailboxCapacityTier(connectedEligibleCount);
  if (tier === "none") {
    return `0/${String(max)} — connect at least one eligible sending mailbox`;
  }
  if (tier === "max_recommended") {
    return `Fully provisioned — ${String(max)}/${String(max)} (maximum recommended capacity)`;
  }
  return `Ready with reduced daily capacity — ${String(connectedEligibleCount)}/${String(max)} connected (recommended: up to ${String(max)})`;
}

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
