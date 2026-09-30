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
 * A campaign at or above this score is approved on that check.
 * Below it, the emails are rewritten while checks remain.
 */
export const AI_CAMPAIGN_REVIEW_THRESHOLD = 75;
/**
 * Lowest score the campaign review calls solid writing.
 * `scoreBand` starts the solid band here. After the allowed checks, a score
 * at or above this floor is sent without a staff click. Below it, the writing
 * still needs work and the campaign waits for staff. This floor does not
 * replace the pass line: a near-miss is rewritten first.
 */
export const AI_CAMPAIGN_REVIEW_SOLID_FLOOR = 70;
/** How many reviews run before a score below the solid floor waits for a person. */
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

export type WritingCheckSendDecision = "approve" | "revise" | "needs_staff";

/**
 * What the writing check does with one score.
 *
 * At or above the pass line, approve now. Under it, with checks left, rewrite.
 * Once the checks are used up, a score still in the solid band is approved so
 * a near-miss does not wait for a person. Below that band, do not send.
 * This is the writing score only. Do-not-contact, suppression, and mailbox
 * caps are separate and are not decided here.
 */
export function writingCheckSendDecision(input: {
  score: number;
  rounds: number;
  passLine?: number;
  maxRounds?: number;
  solidFloor?: number;
}): WritingCheckSendDecision {
  const passLine = input.passLine ?? AI_CAMPAIGN_REVIEW_THRESHOLD;
  const maxRounds = input.maxRounds ?? AI_CAMPAIGN_MAX_REVIEW_ROUNDS;
  const solidFloor = input.solidFloor ?? AI_CAMPAIGN_REVIEW_SOLID_FLOOR;
  if (input.score >= passLine) return "approve";
  if (input.rounds < maxRounds) return "revise";
  if (input.score >= solidFloor) return "approve";
  return "needs_staff";
}

export function reviewFeedbackText(
  summary: string,
  findings: readonly { finding: string; suggestion: string }[],
): string {
  const lines = [summary.trim()];
  for (const finding of findings.slice(0, 12)) {
    const line = `${finding.finding.trim()} ${finding.suggestion.trim()}`.trim();
    if (line) lines.push(line);
  }
  return lines.filter((line) => line.length > 0).join("\n").slice(0, 4000);
}
