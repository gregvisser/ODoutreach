/**
 * What an AI campaign does on the next tick.
 * The caller performs one side effect, then applies {@link reduceAiCampaign}.
 * Calling decide again with the same snapshot returns the same decision.
 */

import {
  aiCampaignHardFailureMessage,
  aiCampaignTransientRetryMessage,
  isTransientAiCampaignProviderFailure,
} from "./provider-failure";
import {
  AI_CAMPAIGN_FAILURE_LIMIT,
  AI_CAMPAIGN_LOW_WATER,
  AI_CAMPAIGN_REVIEW_RUNAWAY_LIMIT,
  AI_CAMPAIGN_REVIEW_THRESHOLD,
} from "./policy";

export const AI_CAMPAIGN_STATUSES = [
  "SOURCING",
  "WRITING",
  "REVIEWING",
  "REVISING",
  "NEEDS_STAFF",
  "PREPARING",
  "LAUNCHING",
  "RUNNING",
  "PAUSED",
  "STOPPED",
  "COMPLETED",
  "FAILED",
] as const;

export type AiCampaignStatus = (typeof AI_CAMPAIGN_STATUSES)[number];

export type AiCampaignSnapshot = {
  status: AiCampaignStatus;
  resumeStatus: AiCampaignStatus | null;
  killSwitchOn: boolean;
  now: Date;
  endsAt: Date | null;
  targetContactCount: number;
  contactsSourced: number;
  creditsAllowed: number;
  reviewScore: number | null;
  reviewRounds: number;
  reviewThreshold: number;
  /** Runaway ceiling. A low writing score keeps rewriting until this many checks. */
  maxReviewRounds: number;
  listExhausted: boolean;
  draftReady: boolean;
  templatesApproved: boolean;
  sequencePrepared: boolean;
  introStarted: boolean;
  pendingWork: number;
  unenrolledReady: number;
  lowWater: number;
  consecutiveFailures: number;
  failureLimit: number;
};

export type AiCampaignCommand = "tick" | "pause" | "resume" | "stop";

export type AiCampaignDecision =
  | { type: "idle"; reason: string }
  | { type: "hold"; reason: string }
  | { type: "source" }
  | { type: "write" }
  | { type: "review" }
  | { type: "revise" }
  | { type: "needs_staff"; reason: string }
  | { type: "approve" }
  | { type: "prepare" }
  | { type: "launch" }
  | { type: "run" }
  | { type: "complete"; reason: string }
  | { type: "pause"; reason: string }
  | { type: "resume" }
  | { type: "stop"; reason: string };

export type AiCampaignOutcome = {
  contactsSourced?: number;
  listExhausted?: boolean;
  draftReady?: boolean;
  reviewScore?: number | null;
  templatesApproved?: boolean;
  sequencePrepared?: boolean;
  introStarted?: boolean;
  pendingWork?: number;
  unenrolledReady?: number;
  creditsAllowed?: number;
};

const TERMINAL = new Set<AiCampaignStatus>(["STOPPED", "COMPLETED", "FAILED"]);

export function aiCampaignSnapshot(overrides: Partial<AiCampaignSnapshot> = {}): AiCampaignSnapshot {
  return {
    status: "SOURCING",
    resumeStatus: null,
    killSwitchOn: true,
    now: new Date("2026-09-30T12:00:00.000Z"),
    endsAt: null,
    targetContactCount: 20,
    contactsSourced: 0,
    creditsAllowed: 10,
    reviewScore: null,
    reviewRounds: 0,
    reviewThreshold: AI_CAMPAIGN_REVIEW_THRESHOLD,
    maxReviewRounds: AI_CAMPAIGN_REVIEW_RUNAWAY_LIMIT,
    listExhausted: false,
    draftReady: false,
    templatesApproved: false,
    sequencePrepared: false,
    introStarted: false,
    pendingWork: 0,
    unenrolledReady: 0,
    lowWater: AI_CAMPAIGN_LOW_WATER,
    consecutiveFailures: 0,
    failureLimit: AI_CAMPAIGN_FAILURE_LIMIT,
    ...overrides,
  };
}

function sourcingBlock(snapshot: AiCampaignSnapshot): "write" | "needs_staff" | null {
  if (snapshot.contactsSourced >= snapshot.targetContactCount && snapshot.contactsSourced > 0) return "write";
  // A zero credit balance only stops paid lookups. This client's own people
  // are free, so sourcing continues until that pass finds nobody left.
  if (snapshot.listExhausted) {
    return snapshot.contactsSourced > 0 ? "write" : "needs_staff";
  }
  return null;
}

function endDateReached(snapshot: AiCampaignSnapshot): boolean {
  return snapshot.endsAt !== null && snapshot.now.getTime() >= snapshot.endsAt.getTime();
}

export function decideAiCampaignTick(
  snapshot: AiCampaignSnapshot,
  command: AiCampaignCommand = "tick",
): AiCampaignDecision {
  if (command === "stop") {
    if (TERMINAL.has(snapshot.status)) return { type: "idle", reason: "This campaign has already finished." };
    return { type: "stop", reason: "A member of staff stopped this campaign." };
  }
  if (command === "pause") {
    if (TERMINAL.has(snapshot.status) || snapshot.status === "PAUSED" || snapshot.status === "NEEDS_STAFF") {
      return { type: "idle", reason: "This campaign is not sending." };
    }
    return { type: "pause", reason: "A member of staff paused this campaign." };
  }
  if (command === "resume") {
    if (snapshot.status !== "PAUSED") return { type: "idle", reason: "This campaign is not paused." };
    return { type: "resume" };
  }

  if (TERMINAL.has(snapshot.status)) return { type: "idle", reason: "This campaign has finished." };
  if (snapshot.status === "NEEDS_STAFF") return { type: "idle", reason: "Waiting for a member of staff." };

  if (endDateReached(snapshot)) {
    return { type: "complete", reason: "The end date has passed." };
  }
  if (snapshot.status === "PAUSED") return { type: "idle", reason: "This campaign is paused." };
  if (!snapshot.killSwitchOn) {
    return { type: "hold", reason: "AI campaigns are switched off. Nothing new will be sent until the switch is on." };
  }

  switch (snapshot.status) {
    case "SOURCING": {
      const blocked = sourcingBlock(snapshot);
      if (blocked === "write") return { type: "write" };
      if (blocked === "needs_staff") {
        return { type: "needs_staff", reason: "No people were found within the credit budget." };
      }
      return { type: "source" };
    }
    case "WRITING":
      return snapshot.draftReady ? { type: "review" } : { type: "write" };
    case "REVIEWING": {
      if (snapshot.reviewScore === null) return { type: "review" };
      // At or above the line the emails may be approved. Below the line they are rewritten.
      if (snapshot.reviewScore >= snapshot.reviewThreshold) return { type: "approve" };
      // A low score never waits for staff merely because it has been checked a few times.
      // Rewriting continues until the score passes, a person pauses or stops the campaign,
      // or this runaway ceiling is hit.
      if (snapshot.reviewRounds < snapshot.maxReviewRounds) return { type: "revise" };
      return {
        type: "needs_staff",
        reason: `The emails scored ${String(snapshot.reviewScore)} after ${String(snapshot.reviewRounds)} checks and stayed below the line. Rewriting has stopped so this does not continue without a person. They were not sent.`,
      };
    }
    case "REVISING":
      return { type: "write" };
    case "PREPARING":
      return snapshot.sequencePrepared ? { type: "launch" } : { type: "prepare" };
    case "LAUNCHING":
      return snapshot.introStarted ? { type: "run" } : { type: "launch" };
    case "RUNNING": {
      const cannotAddMore =
        snapshot.listExhausted ||
        snapshot.creditsAllowed <= 0 ||
        snapshot.contactsSourced >= snapshot.targetContactCount;
      if (snapshot.pendingWork === 0 && cannotAddMore) {
        return { type: "complete", reason: "Everyone who could be contacted from this campaign has been contacted." };
      }
      const roomToBuy =
        snapshot.contactsSourced < snapshot.targetContactCount &&
        !snapshot.listExhausted &&
        snapshot.creditsAllowed > 0;
      if (roomToBuy && snapshot.unenrolledReady < snapshot.lowWater) return { type: "source" };
      return { type: "run" };
    }
    default:
      return { type: "idle", reason: "Nothing to do." };
  }
}

function withOutcome(snapshot: AiCampaignSnapshot, outcome: AiCampaignOutcome): AiCampaignSnapshot {
  return {
    ...snapshot,
    contactsSourced: outcome.contactsSourced ?? snapshot.contactsSourced,
    listExhausted: outcome.listExhausted ?? snapshot.listExhausted,
    draftReady: outcome.draftReady ?? snapshot.draftReady,
    templatesApproved: outcome.templatesApproved ?? snapshot.templatesApproved,
    sequencePrepared: outcome.sequencePrepared ?? snapshot.sequencePrepared,
    introStarted: outcome.introStarted ?? snapshot.introStarted,
    pendingWork: outcome.pendingWork ?? snapshot.pendingWork,
    unenrolledReady: outcome.unenrolledReady ?? snapshot.unenrolledReady,
    creditsAllowed: outcome.creditsAllowed ?? snapshot.creditsAllowed,
  };
}

/** Apply a decision after its side effect. A repeated reduce of the same status does not jump twice. */
export function reduceAiCampaign(
  snapshot: AiCampaignSnapshot,
  decision: AiCampaignDecision,
  outcome: AiCampaignOutcome = {},
): AiCampaignSnapshot {
  const next = withOutcome(snapshot, outcome);
  switch (decision.type) {
    case "idle":
    case "hold":
      return next;
    case "source":
      return { ...next, consecutiveFailures: 0 };
    case "write":
      if (outcome.draftReady) {
        return { ...next, status: "REVIEWING", reviewScore: null, draftReady: true, consecutiveFailures: 0 };
      }
      return next;
    case "review":
      if (typeof outcome.reviewScore === "number") {
        return {
          ...next,
          status: "REVIEWING",
          reviewScore: outcome.reviewScore,
          reviewRounds: snapshot.reviewRounds + 1,
          consecutiveFailures: 0,
        };
      }
      return next;
    case "revise":
      return { ...next, status: "REVISING", reviewScore: null, draftReady: false, consecutiveFailures: 0 };
    case "needs_staff":
      return { ...next, status: "NEEDS_STAFF", consecutiveFailures: 0 };
    case "approve":
      // A score under the line must not approve, even if a caller asks.
      if (snapshot.reviewScore === null || snapshot.reviewScore < snapshot.reviewThreshold) return snapshot;
      return outcome.templatesApproved
        ? { ...next, status: "PREPARING", templatesApproved: true, consecutiveFailures: 0 }
        : next;
    case "prepare":
      return outcome.sequencePrepared
        ? { ...next, status: "LAUNCHING", sequencePrepared: true, consecutiveFailures: 0 }
        : next;
    case "launch":
      return outcome.introStarted
        ? { ...next, status: "RUNNING", introStarted: true, consecutiveFailures: 0 }
        : next;
    case "run":
      return { ...next, status: "RUNNING", consecutiveFailures: 0 };
    case "complete":
      return { ...next, status: "COMPLETED" };
    case "pause":
      if (snapshot.status === "PAUSED") return next;
      return { ...next, status: "PAUSED", resumeStatus: snapshot.status };
    case "resume": {
      const resumeStatus = snapshot.resumeStatus ?? "RUNNING";
      return { ...next, status: resumeStatus, resumeStatus: null };
    }
    case "stop":
      return { ...next, status: "STOPPED" };
    default:
      return next;
  }
}

export function noteStageFailure(
  snapshot: AiCampaignSnapshot,
  message: string,
): { snapshot: AiCampaignSnapshot; decision: AiCampaignDecision; retryable: boolean } {
  if (isTransientAiCampaignProviderFailure(message)) {
    return {
      snapshot,
      decision: { type: "hold", reason: aiCampaignTransientRetryMessage(message) },
      retryable: true,
    };
  }
  const failures = snapshot.consecutiveFailures + 1;
  if (failures >= snapshot.failureLimit) {
    return {
      snapshot: { ...snapshot, consecutiveFailures: failures, status: "NEEDS_STAFF" },
      decision: { type: "needs_staff", reason: aiCampaignHardFailureMessage(message, true) },
      retryable: false,
    };
  }
  return {
    snapshot: { ...snapshot, consecutiveFailures: failures },
    decision: { type: "hold", reason: aiCampaignHardFailureMessage(message, false) },
    retryable: false,
  };
}
