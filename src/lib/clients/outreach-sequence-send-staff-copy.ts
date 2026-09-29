import type { OutboundEmailStatus } from "@/generated/prisma/enums";
import { SEQUENCE_INTRODUCTION_BATCH_CAP } from "@/lib/controlled-pilot-constants";

/**
 * Stable internal marker emitted by the step-send snapshot when a recipient is
 * still flagged "client not active" BUT the client has since gone live. The
 * recipient row was checked before activation and just needs a refresh — it is
 * NOT an onboarding gap. Surfaced as friendly copy below; never shown raw.
 */
export const STALE_RECIPIENTS_CLIENT_NOW_LIVE_REASON =
  "stale_recipients_client_now_live";

/** Friendly copy for {@link STALE_RECIPIENTS_CLIENT_NOW_LIVE_REASON}. */
export const STALE_RECIPIENTS_CLIENT_NOW_LIVE_COPY =
  "These recipients were checked before this client went live. Open Review recipients to update who can send, then launch.";

/**
 * Maps internal / server snapshot reasons to short staff-facing copy for Outreach.
 */
export function humanizeSequenceLaunchDisabledReason(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim();
  // Client is now live, but recipients carry a pre-activation "not active"
  // flag — guide to a refresh, NOT back to onboarding. Checked before the
  // generic client-inactive branch so the live case wins.
  if (s === STALE_RECIPIENTS_CLIENT_NOW_LIVE_REASON) {
    return STALE_RECIPIENTS_CLIENT_NOW_LIVE_COPY;
  }
  // Governance gate codes — never surface raw "blocked_*" strings to staff.
  if (/blocked_client_inactive/i.test(s) || (/Client is/i.test(s) && /not ACTIVE/i.test(s))) {
    return "This client isn't live yet. Finish the onboarding sections on the client overview page — the client activates automatically when every section is ready.";
  }
  if (/blocked_launch_approval_required/i.test(s)) {
    return "This client still needs to finish onboarding before sequences can launch.";
  }
  if (/blocked_live_mode_not_enabled/i.test(s)) {
    return "Live sending isn't enabled for this client yet.";
  }
  if (/blocked_unsubscribe_required/i.test(s)) {
    return "An unsubscribe link is required before this sequence can send.";
  }
  if (/blocked_allowlist/i.test(s)) {
    return "Sending is restricted to allowlisted recipients right now.";
  }
  if (/not APPROVED/i.test(s) && /Sequence is/i.test(s)) {
    return "This sequence is not activated for sending yet. Save again, or open Templates if an email still needs approval.";
  }
  if (/template is .* not APPROVED/i.test(s)) {
    return "Open Templates and finish this email template before launching.";
  }
  if (/missing an email address/i.test(s)) {
    return "No eligible recipients — some prepared rows are missing an email address.";
  }
  if (/No eligible recipients/i.test(s) && /launch batch/i.test(s)) {
    return "No recipients are ready to send for this sequence right now. Open Review recipients to see why — they may already be enrolled in another sequence, suppressed, or missing an email address.";
  }
  if (/Review recipients to refresh/i.test(s) || /refresh the launch batch/i.test(s)) {
    return "No recipients are ready to send right now. Open Review recipients to see why — they may already be enrolled in another sequence, suppressed, or missing an email address.";
  }
  if (/prepare send rows|prepare send records|send rows/i.test(s)) {
    return "No eligible recipients yet. Open Review recipients to add or refresh the contacts for this sequence.";
  }
  if (/Previous step/i.test(s) && /SENT/i.test(s)) {
    return "The previous step must finish sending before this step can go out.";
  }
  if (/Delay .* has not elapsed/i.test(s)) {
    return "The scheduled wait between steps has not finished yet for eligible recipients.";
  }
  return s;
}

export function sequenceIntroductionBatchLimitCopy(hardCap: number): string {
  const cap = hardCap > 0 ? hardCap : SEQUENCE_INTRODUCTION_BATCH_CAP;
  return `This launch queues up to ${String(cap)} eligible emails. Sending follows the calendar, warm-up and remaining mailbox allowance; queueing does not mean immediate delivery.`;
}

/**
 * Short paragraph for the live sequence launch panel. Kept in one place
 * so unit tests can assert we do not surface internal-domain wording.
 */
/** Shown when Launch is pressed and no READY recipient rows exist. */
export const NO_READY_STEP_SENDS_MESSAGE =
  "No recipients are ready for this step. Open Review recipients, then launch again.";

/**
 * Persisted on a READY row when pacing deferred it. Staff must launch again;
 * the scheduler does not send Human introductions on its own.
 */
export const PACING_HOLD_REASON =
  "Held back by send pacing — the next batch is during today's sending hours. Launch this sequence again then; it will not send on its own.";

export const CALENDAR_HOLD_REASON =
  "Waiting for the next allowed batch in this client's sending calendar. Launch this sequence again during those hours; it will not send on its own.";

export const CAPACITY_HOLD_REASON =
  "No mailbox capacity remaining in this sending day. Launch this sequence again on the next sending day; it will not send on its own.";

export const FAIR_SHARE_HOLD_REASON =
  "Held back so another sequence on this mailbox gets its share of the current batch. Launch that sequence during sending hours, then launch this one again. It will not send on its own.";

/** True for a deferral that left the row READY for another launch. */
export function isDispatchHoldReason(raw: string | null | undefined): boolean {
  if (!raw || !raw.trim()) return false;
  const lower = raw.toLowerCase();
  return (
    lower.includes("send pacing") ||
    lower.includes("sending calendar") ||
    lower.includes("mailbox capacity") ||
    lower.includes("at-a-time release") ||
    lower.includes("gets its share")
  );
}

/**
 * Staff sentence for a pacing / calendar / capacity / fair-share hold,
 * including rows saved before this copy was introduced.
 */
export function staffCopyForDispatchHold(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("gets its share") || lower.includes("another sequence")) {
    return FAIR_SHARE_HOLD_REASON;
  }
  if (lower.includes("sending calendar")) return CALENDAR_HOLD_REASON;
  if (lower.includes("mailbox capacity")) return CAPACITY_HOLD_REASON;
  if (lower.includes("at-a-time release")) {
    return `${raw} Launch this sequence again after that wait; it will not send on its own.`;
  }
  return PACING_HOLD_REASON;
}

/** Follow-ups older than the automatic window stay for a person to send. */
export function staleAutoFollowUpStaffCopy(count: number, days: number): string {
  const noun = count === 1 ? "follow-up is" : "follow-ups are";
  return `${String(count)} ${noun} past the ${String(days)}-day automatic send window. The scheduler will not send them. Use Send now on this step.`;
}

export const LIVE_SEQUENCE_LAUNCH_INTRO_HELP =
  "Sends use your connected mailboxes, daily limits, and suppression rules. Eligibility is re-checked when you launch.";

export const LIVE_SEQUENCE_LAUNCH_FOLLOW_HELP =
  "Sends one step at a time. Eligibility, delays, and suppression are re-checked when you launch.";

/**
 * Row 111 finding 1 — after a launch, the flash banner always said "N
 * queued", even once the row had already gone QUEUED → SENT via Graph
 * (`docs/ops/SEND-PROOF-2026-08-30.md` measured ~1.2s). The dispatcher
 * awaits the queue drain before returning, so by the time this banner
 * renders, dispatch has very often already finished. Callers re-read each
 * newly-created `OutboundEmail`'s real status and classify it here so the
 * banner reports what actually happened, not the fixed intake word.
 */
export type SequenceDispatchOutcome = {
  /** Reached a terminal "left the building" status by the time we checked. */
  sentImmediately: number;
  /** Reached a terminal failure status by the time we checked. */
  failedImmediately: number;
  /** Still genuinely in flight — the worker has not resolved it yet. */
  stillPending: number;
};

const DISPATCH_OUTCOME_SENT_STATUSES = new Set<OutboundEmailStatus>([
  "SENT",
  "DELIVERED",
  "REPLIED",
]);

const DISPATCH_OUTCOME_FAILED_STATUSES = new Set<OutboundEmailStatus>([
  "FAILED",
  "BOUNCED",
  "BLOCKED_SUPPRESSION",
]);

export function classifySequenceDispatchOutcome(
  statuses: readonly OutboundEmailStatus[],
): SequenceDispatchOutcome {
  let sentImmediately = 0;
  let failedImmediately = 0;
  for (const status of statuses) {
    if (DISPATCH_OUTCOME_SENT_STATUSES.has(status)) sentImmediately += 1;
    else if (DISPATCH_OUTCOME_FAILED_STATUSES.has(status)) failedImmediately += 1;
  }
  return {
    sentImmediately,
    failedImmediately,
    stillPending: Math.max(
      0,
      statuses.length - sentImmediately - failedImmediately,
    ),
  };
}

/**
 * `categoryLabel` is the singular noun already used elsewhere in the flash
 * message ("introduction", "follow up 1", ...); this adds "s" for plurals,
 * matching the existing pluralisation in `sequence-actions.ts`.
 */
export function describeSequenceDispatchOutcome(
  categoryLabel: string,
  outcome: SequenceDispatchOutcome,
): string {
  const total =
    outcome.sentImmediately + outcome.failedImmediately + outcome.stillPending;
  if (total === 0) return `0 ${categoryLabel}s queued`;

  const parts: string[] = [];
  if (outcome.sentImmediately > 0) {
    parts.push(
      outcome.sentImmediately === 1
        ? `1 ${categoryLabel} sent`
        : `${String(outcome.sentImmediately)} ${categoryLabel}s sent`,
    );
  }
  if (outcome.stillPending > 0) {
    parts.push(
      outcome.stillPending === 1
        ? `1 ${categoryLabel} queued — waiting for an allowed sending time and available allowance`
        : `${String(outcome.stillPending)} ${categoryLabel}s queued — waiting for an allowed sending time and available allowance`,
    );
  }
  if (outcome.failedImmediately > 0) {
    parts.push(
      outcome.failedImmediately === 1
        ? `1 ${categoryLabel} failed to send (see timeline for the reason)`
        : `${String(outcome.failedImmediately)} ${categoryLabel}s failed to send (see timeline for the reason)`,
    );
  }
  return parts.join(" · ");
}
