/**
 * Rules for an AI campaign. No database and no network.
 *
 * The scheduled tick and the send path both call these functions so a
 * budget, a do-not-contact flag, or a mailbox cap cannot be decided
 * differently in two places.
 */

import type { StaffRole } from "@/generated/prisma/enums";
import {
  ROCKETREACH_AUTO_TOP_UP_MAX_BATCH,
  ROCKETREACH_AUTO_TOP_UP_MIN_BATCH,
} from "@/lib/clients/rocketreach-import-cap";
import { autoTopUpBatchSize } from "@/lib/clients/rocketreach-refill-policy";

export const AI_CAMPAIGN_CONFIRMATION_PHRASE = "START AI CAMPAIGN";
export const AI_CAMPAIGN_PAUSE_PHRASE = "PAUSE AI CAMPAIGN";
export const AI_CAMPAIGN_RESUME_PHRASE = "RESUME AI CAMPAIGN";
export const AI_CAMPAIGN_STOP_PHRASE = "STOP AI CAMPAIGN";

/**
 * Emails below this score are rewritten. They are not approved and they are not sent.
 * A low score does not wait for a member of staff.
 */
export const AI_CAMPAIGN_REVIEW_THRESHOLD = 75;
/**
 * A typical number of writing checks. It is not a stop.
 * A score under the threshold keeps rewriting past this.
 */
export const AI_CAMPAIGN_MAX_REVIEW_ROUNDS = 3;
/**
 * Runaway ceiling for a writing score that stays under the threshold.
 * Rewriting continues on every later tick until the score is at least 75,
 * a person pauses or stops the campaign, or a hard failure hits the failure limit.
 * Only after this many checks does a still-low score wait for a person, so a
 * campaign cannot call the writer without end. Three checks is not this ceiling.
 */
export const AI_CAMPAIGN_REVIEW_RUNAWAY_LIMIT = 30;
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
/**
 * Floor of the top-up trigger. The real trigger is one day of the client's
 * safe mailbox capacity (see {@link aiCampaignTopUp}); this applies when that
 * is smaller or unknown.
 */
export const AI_CAMPAIGN_LOW_WATER = 5;

/**
 * Automatic RocketReach top-up for an AI campaign. Always on: an AI campaign
 * has no per-sequence toggle (manual sequences keep theirs).
 *
 * - `firstBatch`: how many people the campaign sources before it writes and
 *   launches. 10-30, sized to three days of safe mailbox sending.
 * - `lowWater`: top up when fewer people than one day of safe sending are
 *   still waiting for their first email.
 * - `batch`: the size of the next top-up (10-30), 0 when the waiting people
 *   already cover the horizon.
 *
 * Universe is always tried first; RocketReach credits only fill the gap, and
 * stay inside the campaign's own credit budget and the balance floor.
 */
export function aiCampaignTopUp(input: {
  mailboxDailyCaps: readonly number[];
  awaitingFirstEmail: number;
}): { firstBatch: number; lowWater: number; batch: number; dailyCapacity: number } {
  const dailyCapacity = input.mailboxDailyCaps
    .filter((cap) => Number.isFinite(cap) && cap > 0)
    .reduce((sum, cap) => sum + Math.floor(cap), 0);
  const first = autoTopUpBatchSize({ mailboxDailyCaps: input.mailboxDailyCaps, readyNotEnrolled: 0 });
  const next = autoTopUpBatchSize({
    mailboxDailyCaps: input.mailboxDailyCaps,
    readyNotEnrolled: input.awaitingFirstEmail,
  });
  // No sending mailbox yet: source a minimum batch so the campaign can still
  // write and prepare. Nothing sends until a mailbox is connected.
  const fallback = dailyCapacity === 0 ? ROCKETREACH_AUTO_TOP_UP_MIN_BATCH : 0;
  return {
    firstBatch: first.action === "fill" ? first.batch : ROCKETREACH_AUTO_TOP_UP_MIN_BATCH,
    lowWater: Math.max(AI_CAMPAIGN_LOW_WATER, Math.min(dailyCapacity, ROCKETREACH_AUTO_TOP_UP_MAX_BATCH)),
    batch: next.action === "fill" ? next.batch : fallback,
    dailyCapacity,
  };
}
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
