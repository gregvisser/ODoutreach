/**
 * Rules for an AI campaign. No database and no network.
 *
 * The scheduled tick and the send path both call these functions so a
 * budget, a do-not-contact flag, or a mailbox cap cannot be decided
 * differently in two places.
 */

import type { StaffRole } from "@/generated/prisma/enums";

export const AI_CAMPAIGN_CONFIRMATION_PHRASE = "START AI CAMPAIGN";
export const AI_CAMPAIGN_PAUSE_PHRASE = "PAUSE AI CAMPAIGN";
export const AI_CAMPAIGN_RESUME_PHRASE = "RESUME AI CAMPAIGN";
export const AI_CAMPAIGN_STOP_PHRASE = "STOP AI CAMPAIGN";

/**
 * A campaign below this score is rewritten.
 * After {@link AI_CAMPAIGN_MAX_REVIEW_ROUNDS} checks it is still sent, and the score is recorded.
 * The line stays at 75. A low score does not wait for a person and does not block sending.
 */
export const AI_CAMPAIGN_REVIEW_THRESHOLD = 75;
/** How many reviews run before a low score is sent with the score recorded. */
export const AI_CAMPAIGN_MAX_REVIEW_ROUNDS = 3;
/**
 * How many hard failures of the same step ask for a person.
 * Transient xAI capacity and timeouts do not count.
 */
export const AI_CAMPAIGN_FAILURE_LIMIT = 3;
/**
 * How long to wait after xAI is busy or times out.
 * Matches the five-minute outreach pass. The same tick does not call xAI again.
 */
export const AI_CAMPAIGN_TRANSIENT_BACKOFF_MS = 5 * 60 * 1000;
/** Top up the list when fewer than this many people are waiting to be emailed. */
export const AI_CAMPAIGN_LOW_WATER = 5;
/** Recorded on the template when the campaign approves its own copy. */
export const AI_CAMPAIGN_SYSTEM_APPROVAL = "AI";

/** A second campaign cannot start while one of these is still open. */
export const OPEN_AI_CAMPAIGN_STATUSES = [
  "SOURCING",
  "WRITING",
  "REVIEWING",
  "REVISING",
  "NEEDS_STAFF",
  "PREPARING",
  "LAUNCHING",
  "RUNNING",
  "PAUSED",
] as const;

const ON_VALUES = new Set(["1", "true", "yes", "on"]);

/**
 * Global kill switch. Unset, empty, and every value other than the on-list
 * means off, so a deploy cannot start sending until the setting is explicit.
 */
export function isAiCampaignsEnabled(envValue: string | undefined = process.env.AI_CAMPAIGNS_ENABLED): boolean {
  return ON_VALUES.has((envValue ?? "").trim().toLowerCase());
}

export function isAiCampaignConfirmation(phrase: string, expected: string): boolean {
  return phrase.trim() === expected;
}

/** Viewers cannot start, pause, resume, or stop an AI campaign. */
export function staffMayControlAiCampaign(role: StaffRole): boolean {
  return role === "ADMIN" || role === "MANAGER" || role === "OPERATOR";
}

export type CreditBalance = number | "unlimited" | "unknown";

export type CreditAllowance = {
  allowed: number;
  reason: string | null;
};

/**
 * How many RocketReach lookups this tick may pay for.
 * The total budget, the daily budget, and the account floor all apply.
 * An unknown balance spends nothing.
 */
export function creditsAllowedForAiCampaign(input: {
  creditBudgetTotal: number;
  creditsCommitted: number;
  creditBudgetPerDay: number;
  creditsCommittedToday: number;
  balance: CreditBalance;
  balanceFloor: number;
}): CreditAllowance {
  const totalLeft = Math.max(0, input.creditBudgetTotal - input.creditsCommitted);
  const dayLeft = Math.max(0, input.creditBudgetPerDay - input.creditsCommittedToday);
  if (input.balance === "unknown") {
    return { allowed: 0, reason: "The RocketReach balance could not be read, so no lookup was paid for." };
  }
  if (totalLeft === 0) {
    return { allowed: 0, reason: "The campaign credit budget is used." };
  }
  if (dayLeft === 0) {
    return { allowed: 0, reason: "Today's credit budget is used." };
  }
  if (input.balance !== "unlimited") {
    const aboveFloor = input.balance - input.balanceFloor;
    if (aboveFloor <= 0) {
      return { allowed: 0, reason: "The RocketReach balance is at its floor, so no lookup was paid for." };
    }
    return { allowed: Math.min(totalLeft, dayLeft, aboveFloor), reason: null };
  }
  return { allowed: Math.min(totalLeft, dayLeft), reason: null };
}

/**
 * A person may be added only for this client, and never when they are
 * suppressed or unsubscribed. There is no path that returns ok for a block.
 */
export function mayAddPersonToAiCampaign(input: {
  suppressed: boolean;
  unsubscribed: boolean;
  sourcedForThisClient: boolean;
}): { ok: true } | { ok: false; reason: string } {
  if (input.suppressed) {
    return { ok: false, reason: "This person is on a do-not-contact list." };
  }
  if (input.unsubscribed) {
    return { ok: false, reason: "This person unsubscribed." };
  }
  if (!input.sourcedForThisClient) {
    return { ok: false, reason: "This person was sourced for a different client." };
  }
  return { ok: true };
}

/** Slots left today. Warm-up can only lower the mailbox cap, never raise it. */
export function mailboxSlotsRemaining(input: {
  sentToday: number;
  dailyCap: number;
  warmupCap: number | null;
}): number {
  const cap = input.warmupCap === null ? input.dailyCap : Math.min(input.dailyCap, input.warmupCap);
  return Math.max(0, cap - Math.max(0, input.sentToday));
}

export function clampBatchToMailboxCap(requested: number, remaining: number, dailyCap: number): number {
  const safeRequested = Math.max(0, requested);
  const safeRemaining = Math.max(0, Math.min(remaining, dailyCap));
  return Math.min(safeRequested, safeRemaining);
}

/**
 * A reply stops that person's emails.
 * The product has no out-of-office label. An unclassified or unclear reply
 * stops as well, which is the conservative choice.
 */
export function replyStopsSequence(classification: string | null): { stop: true; reason: string } {
  if (classification === null || classification.trim() === "") {
    return {
      stop: true,
      reason: "The reply is not classified, so this person's emails stop.",
    };
  }
  return {
    stop: true,
    reason: "A reply stops this person's emails. Out-of-office is not a separate label, so an unclear reply stops too.",
  };
}

export type TemplateApprovalStatus = "DRAFT" | "READY_FOR_REVIEW" | "APPROVED" | "ARCHIVED";

/** Next approval step for a template. Archived templates are refused. */
export function templateMachineApprovalStep(
  status: TemplateApprovalStatus,
  systemApprovalKind: string | null,
): "skip" | "mark_ready" | "approve" | "refuse" {
  if (status === "ARCHIVED") return "refuse";
  if (status === "APPROVED" && systemApprovalKind === AI_CAMPAIGN_SYSTEM_APPROVAL) return "skip";
  if (status === "APPROVED") return "skip";
  if (status === "DRAFT") return "mark_ready";
  return "approve";
}

export function sequenceMachineApprovalStep(
  status: TemplateApprovalStatus,
): "skip" | "mark_ready" | "approve" | "refuse" {
  if (status === "ARCHIVED") return "refuse";
  if (status === "APPROVED") return "skip";
  if (status === "DRAFT") return "mark_ready";
  return "approve";
}

/**
 * Which sequences the follow-up tick may touch.
 * Null means every approved sequence on a Machine-sending client.
 * An array is an explicit list. A client that is not on Machine sending
 * only contributes sequences that belong to a running AI campaign.
 */
export function followUpSequenceIds(input: {
  machineSend: boolean;
  requestedSequenceIds: readonly string[] | null;
  aiRunningSequenceIds: readonly string[];
}): readonly string[] | null {
  if (input.machineSend) return input.requestedSequenceIds;
  const allowed = new Set(input.aiRunningSequenceIds);
  const requested = input.requestedSequenceIds ?? input.aiRunningSequenceIds;
  return requested.filter((id) => allowed.has(id));
}

/** Pacing resume must not continue an AI campaign that is not actively sending. */
export function aiCampaignSequenceHeldFromAutoSend(input: {
  killSwitchOn: boolean;
  status: string;
}): boolean {
  if (!input.killSwitchOn) return true;
  return input.status !== "RUNNING" && input.status !== "LAUNCHING";
}

/**
 * The write that follows a failed check is the last one when the next check
 * would use up the review budget. The first draft (no checks yet) is not a rewrite.
 */
export function isLastAiCampaignRewrite(
  reviewRounds: number,
  maxReviewRounds: number = AI_CAMPAIGN_MAX_REVIEW_ROUNDS,
): boolean {
  return reviewRounds > 0 && reviewRounds >= maxReviewRounds - 1;
}

/**
 * Timeline text when the rewrite budget is used and the score is still under the line.
 * Sending continues. The words must not say the emails were held or not sent.
 */
export function aiCampaignScoreReleaseMessage(score: number, rounds: number): string {
  return `The emails scored ${String(score)} after ${String(rounds)} checks. They are still under ${String(AI_CAMPAIGN_REVIEW_THRESHOLD)}, and there are no checks left, so sending continues with this score on the record.`;
}

export function reviewFeedbackText(
  summary: string,
  findings: readonly { finding: string; suggestion: string; severity?: string; area?: string }[],
): string {
  const lines = [`Overall: ${summary.trim()}`];
  findings.slice(0, 12).forEach((finding, index) => {
    const where = [finding.severity?.trim(), finding.area?.trim()].filter((part): part is string => Boolean(part)).join(", ");
    const change = finding.suggestion.trim();
    const line = [
      `${String(index + 1)}.`,
      where ? `(${where})` : null,
      finding.finding.trim(),
      change ? `Change: ${change}` : null,
    ].filter((part): part is string => Boolean(part)).join(" ");
    if (line.length > 3) lines.push(line);
  });
  lines.push("Rewrite so each numbered point is fixed. Use only facts from the brief. Do not add a statistic, a client name, a price, or a case study that was not given.");
  return lines.filter((line) => line.length > 0).join("\n").slice(0, 4000);
}
