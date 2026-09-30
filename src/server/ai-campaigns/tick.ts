import "server-only";

import type { StaffUser } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { sanitizeJobErrorText } from "@/lib/alerts/job-error-text";
import { ROCKETREACH_MAX_IMPORT } from "@/lib/clients/rocketreach-import-cap";
import { parseOptionalCreditFloor } from "@/lib/clients/rocketreach-refill-policy";
import type { CreditBalance } from "@/lib/ai-campaigns/policy";
import {
  AI_CAMPAIGN_LOW_WATER,
  AI_CAMPAIGN_SYSTEM_APPROVAL,
  AI_CAMPAIGN_TICK_BACKOFF_MS,
  aiCampaignContactsStillNeeded,
  creditsAllowedForAiCampaign,
  isAiCampaignsEnabled,
  reviewFeedbackText,
  sequenceMachineApprovalStep,
  templateMachineApprovalStep,
} from "@/lib/ai-campaigns/policy";
import { aiCampaignDecisionMessage, companySizeLabel } from "@/lib/ai-campaigns/copy";
import {
  aiCampaignSnapshot,
  decideAiCampaignTick,
  reduceAiCampaign,
  resolveAiCampaignTickFailure,
  type AiCampaignDecision,
  type AiCampaignOutcome,
  type AiCampaignSnapshot,
  type AiCampaignStatus,
} from "@/lib/ai-campaigns/state-machine";
import { logger } from "@/lib/logger";
import { draftSequenceForClient } from "@/server/ai/draft-sequence";
import { reviewCampaign } from "@/server/ai/review-campaign";
import { findOrCreateClientContactListByName } from "@/server/contacts/contact-lists";
import { approveTemplate, markTemplateReadyForReview } from "@/server/email-templates/mutations";
import { advanceDueSequenceFollowUps } from "@/server/email-sequences/advance-due-followups";
import { EnrollmentFailure, enrollSequenceContacts } from "@/server/email-sequences/enrollments";
import {
  approveSequence,
  createSequence,
  markSequenceReadyForReview,
  setSequenceSteps,
} from "@/server/email-sequences/mutations";
import { SequenceStepSendError, sendSequenceStepBatch } from "@/server/email-sequences/send-introduction";
import { planSequenceStepSends } from "@/server/email-sequences/step-sends";
import { getSequenceStepSendConfirmationPhrase } from "@/lib/email-sequences/sequence-send-execution-constants";
import { loadRocketReachCreditSnapshot } from "@/server/integrations/rocketreach/account";
import type { RocketReachLookupGovernor } from "@/server/integrations/rocketreach/person-import";
import { markReservationReleasedForOutboundInTransaction } from "@/server/mailbox/sending-policy";
import { applyUniverseHarvest } from "@/server/prospect-research/universe-harvest";
import { executeSavedResearchPlan } from "@/server/prospect-research/execute-plan";
import { countReadyNotEnrolled } from "@/server/prospect-research/auto-refill";

const ACTIVE_CREDIT = ["RESERVED", "CHARGED"] as const;
const LOCK_MS = 4 * 60 * 1000;

type CampaignRow = {
  id: string;
  clientId: string;
  name: string;
  status: AiCampaignStatus;
  resumeStatus: AiCampaignStatus | null;
  brief: string;
  jobTitles: string[];
  countries: string[];
  industries: string[];
  seniorities: string[];
  companySizeMin: number | null;
  companySizeMax: number | null;
  targetContactCount: number;
  creditBudgetTotal: number;
  creditBudgetPerDay: number;
  creditsUsed: number;
  searchStart: number;
  endsAt: Date | null;
  contactListId: string | null;
  sequenceId: string | null;
  researchPlanId: string | null;
  reviewScore: number | null;
  reviewRounds: number;
  reviewFeedback: string | null;
  contactsSourced: number;
  listExhausted: boolean;
  staffAlert: string | null;
  consecutiveFailures: number;
  createdByStaffUserId: string;
};

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function committedCredits(campaignId: string, since?: Date): Promise<number> {
  return prisma.rocketReachCreditReservation.count({
    where: {
      aiOutreachCampaignId: campaignId,
      state: { in: [...ACTIVE_CREDIT] },
      ...(since ? { reservedAt: { gte: since } } : {}),
    },
  });
}

async function loadBalance(): Promise<CreditBalance> {
  const floor = parseOptionalCreditFloor(process.env.ROCKETREACH_MIN_CREDIT_FLOOR);
  if (floor === "invalid") return "unknown";
  const snapshot = await loadRocketReachCreditSnapshot();
  if (snapshot.state !== "ready") return "unknown";
  return snapshot.remaining;
}

function balanceFloor(): number {
  const floor = parseOptionalCreditFloor(process.env.ROCKETREACH_MIN_CREDIT_FLOOR);
  return floor === "invalid" || floor === null ? 0 : floor;
}

function campaignGovernor(campaignId: string, clientId: string, runId: string): RocketReachLookupGovernor {
  return {
    reserve: async (profileId) =>
      prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "AiOutreachCampaign" WHERE id = ${campaignId} FOR UPDATE`;
        const campaign = await tx.aiOutreachCampaign.findUnique({
          where: { id: campaignId },
          select: { creditBudgetTotal: true, creditBudgetPerDay: true },
        });
        if (!campaign) return { proceed: false, reason: "This campaign is no longer available." };
        const committed = await tx.rocketReachCreditReservation.count({
          where: { aiOutreachCampaignId: campaignId, state: { in: [...ACTIVE_CREDIT] } },
        });
        if (committed >= campaign.creditBudgetTotal) {
          return { proceed: false, reason: "The campaign credit budget is used." };
        }
        const today = await tx.rocketReachCreditReservation.count({
          where: {
            aiOutreachCampaignId: campaignId,
            state: { in: [...ACTIVE_CREDIT] },
            reservedAt: { gte: startOfUtcDay(new Date()) },
          },
        });
        if (today >= campaign.creditBudgetPerDay) {
          return { proceed: false, reason: "Today's credit budget is used." };
        }
        const profileKey = String(profileId);
        const existing = await tx.rocketReachCreditReservation.findUnique({
          where: { runId_profileId: { runId, profileId: profileKey } },
        });
        if (existing) return { proceed: false, reason: "This profile was already reserved for this run." };
        await tx.rocketReachCreditReservation.create({
          data: {
            clientId,
            runId,
            profileId: profileKey,
            aiOutreachCampaignId: campaignId,
            state: "RESERVED",
          },
        });
        return { proceed: true };
      }),
    settle: async (profileId, outcome) => {
      if (outcome === "kept") return;
      await prisma.rocketReachCreditReservation.updateMany({
        where: { runId, profileId: String(profileId), state: "RESERVED" },
        data: {
          state: outcome === "charged" ? "CHARGED" : "RELEASED",
          resolvedAt: new Date(),
        },
      });
    },
  };
}

async function countSourced(clientId: string, contactListId: string): Promise<number> {
  return prisma.contactListMember.count({
    where: {
      clientId,
      contactListId,
      contact: { email: { not: null }, isSuppressed: false },
    },
  });
}

async function loadActor(): Promise<StaffUser | null> {
  return prisma.staffUser.findFirst({
    where: { role: "ADMIN", isActive: true },
    orderBy: { createdAt: "asc" },
  });
}

async function appendEvent(campaignId: string, stage: string, kind: string, message: string): Promise<void> {
  await prisma.aiOutreachCampaignEvent.create({
    data: { campaignId, stage, kind, message: message.slice(0, 2000) },
  });
}

async function appendEventOnce(campaignId: string, stage: string, kind: string, message: string): Promise<void> {
  const latest = await prisma.aiOutreachCampaignEvent.findFirst({
    where: { campaignId },
    orderBy: { at: "desc" },
    select: { message: true },
  });
  if (latest?.message === message) return;
  await appendEvent(campaignId, stage, kind, message);
}

export async function holdUnsentAiCampaignMail(clientId: string, sequenceId: string): Promise<number> {
  const rows = await prisma.clientEmailSequenceStepSend.findMany({
    where: {
      clientId,
      sequenceId,
      outboundEmail: {
        clientId,
        dispatchStartedAt: null,
        providerMessageId: null,
        status: { in: ["QUEUED", "PROCESSING"] },
      },
    },
    select: { id: true, outboundEmailId: true },
  });
  let held = 0;
  for (const row of rows) {
    if (!row.outboundEmailId) continue;
    const outboundEmailId = row.outboundEmailId;
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.outboundEmail.updateMany({
        where: {
          id: outboundEmailId,
          clientId,
          dispatchStartedAt: null,
          providerMessageId: null,
          status: { in: ["QUEUED", "PROCESSING"] },
        },
        data: {
          status: "FAILED",
          claimedAt: null,
          claimExpiresAt: null,
          providerIdempotencyKey: null,
          nextRetryAt: null,
          lastErrorCode: "AI_CAMPAIGN_HELD",
          lastErrorMessage: "This AI campaign was paused or stopped before this email was sent.",
          failureReason: "This AI campaign was paused or stopped before this email was sent.",
        },
      });
      if (result.count === 0) return 0;
      await markReservationReleasedForOutboundInTransaction(tx, outboundEmailId);
      await tx.clientEmailSequenceStepSend.update({
        where: { id: row.id },
        data: {
          outboundEmailId: null,
          status: "READY",
          blockedReason: "This AI campaign is paused.",
        },
      });
      return result.count;
    });
    held += updated;
  }
  return held;
}

async function ensureStructure(campaign: CampaignRow): Promise<{
  contactListId: string;
  sequenceId: string;
  researchPlanId: string;
}> {
  const list = campaign.contactListId
    ? { id: campaign.contactListId }
    : await findOrCreateClientContactListByName({
        clientId: campaign.clientId,
        name: `${campaign.name} — people`.slice(0, 120),
        createdByStaffUserId: campaign.createdByStaffUserId,
      });
  let sequenceId = campaign.sequenceId;
  if (!sequenceId) {
    const sequence = await createSequence({
      clientId: campaign.clientId,
      contactListId: list.id,
      name: campaign.name.slice(0, 120),
      description: "Started from Create AI campaign. Staff handle replies.",
      staffUserId: campaign.createdByStaffUserId,
      launchPreferredMailboxId: null,
    });
    sequenceId = sequence.id;
  }
  let researchPlanId = campaign.researchPlanId;
  if (!researchPlanId) {
    const plan = await prisma.prospectResearchPlan.create({
      data: {
        clientId: campaign.clientId,
        name: campaign.name.slice(0, 120),
        criteria: {
          titles: campaign.jobTitles,
          industries: campaign.industries,
          seniorities: campaign.seniorities,
          regions: campaign.countries,
        },
        maxLookups: ROCKETREACH_MAX_IMPORT,
        createdByStaffId: campaign.createdByStaffUserId,
      },
      select: { id: true },
    });
    researchPlanId = plan.id;
  }
  return { contactListId: list.id, sequenceId, researchPlanId };
}

type SourceResult = AiCampaignOutcome & {
  searchStart: number;
  creditsUsed: number;
  detail: string;
  contactListId: string;
  sequenceId: string;
  researchPlanId: string;
};

async function sourcePeople(
  campaign: CampaignRow,
  allowance: number,
  now: Date,
): Promise<SourceResult> {
  const structure = await ensureStructure(campaign);
  const criteria = {
    titles: campaign.jobTitles,
    industries: campaign.industries,
    seniorities: campaign.seniorities,
    regions: campaign.countries,
  };
  const alreadyListed = await countSourced(campaign.clientId, structure.contactListId);
  const shortfall = aiCampaignContactsStillNeeded(campaign.targetContactCount, [
    campaign.contactsSourced,
    alreadyListed,
  ]);
  if (shortfall === 0) {
    return {
      contactsSourced: Math.max(campaign.contactsSourced, alreadyListed),
      listExhausted: campaign.listExhausted,
      searchStart: campaign.searchStart,
      creditsUsed: await committedCredits(campaign.id),
      detail: "Enough people are already on the list, so no further lookup was paid for.",
      contactListId: structure.contactListId,
      sequenceId: structure.sequenceId,
      researchPlanId: structure.researchPlanId,
    };
  }
  const harvested = await applyUniverseHarvest({
    clientId: campaign.clientId,
    sequenceId: structure.sequenceId,
    contactListId: structure.contactListId,
    criteria,
    now,
    maxToAdd: Math.min(shortfall, 50),
    staffId: campaign.createdByStaffUserId,
  });
  if (!harvested.ok) throw new Error(harvested.error);

  let searchStart = campaign.searchStart;
  let listExhausted = false;
  let rocketReachAdded = 0;
  const listedAfterHarvest = await countSourced(campaign.clientId, structure.contactListId);
  const stillNeed = aiCampaignContactsStillNeeded(campaign.targetContactCount, [
    campaign.contactsSourced,
    listedAfterHarvest,
  ]);
  if (stillNeed > 0 && allowance > 0) {
    const pageSize = Math.min(stillNeed, allowance, ROCKETREACH_MAX_IMPORT);
    const bought = await executeSavedResearchPlan({
      clientId: campaign.clientId,
      planId: structure.researchPlanId,
      staffId: campaign.createdByStaffUserId,
      existingListId: structure.contactListId,
      trigger: "AI_CAMPAIGN",
      sequenceId: structure.sequenceId,
      aiOutreachCampaignId: campaign.id,
      start: searchStart,
      pageSize,
      originNote: `Sourced for an AI campaign on ${now.toISOString().slice(0, 10)}`,
      governorForRun: (runId) => campaignGovernor(campaign.id, campaign.clientId, runId),
    });
    if (!bought.ok) throw new Error(bought.error);
    rocketReachAdded = bought.imported;
    if (bought.searchProfileCount === 0) listExhausted = true;
    else if (bought.imported === 0) searchStart += pageSize;
  } else if (stillNeed > 0 && allowance <= 0) {
    // Nothing more can be bought, and a repeat pass would only re-read Universe.
    listExhausted = true;
  }

  const contactsSourced = await countSourced(campaign.clientId, structure.contactListId);
  const creditsUsed = await committedCredits(campaign.id);
  if (harvested.added === 0 && rocketReachAdded === 0 && stillNeed > 0 && allowance > 0 && listExhausted) {
    listExhausted = true;
  }
  return {
    contactsSourced,
    listExhausted: listExhausted || campaign.listExhausted,
    searchStart,
    creditsUsed,
    detail: `Added ${String(harvested.added)} from this client's people and ${String(rocketReachAdded)} from RocketReach.`,
    contactListId: structure.contactListId,
    sequenceId: structure.sequenceId,
    researchPlanId: structure.researchPlanId,
  };
}

async function writeEmails(campaign: CampaignRow): Promise<AiCampaignOutcome> {
  const structure = await ensureStructure(campaign);
  const size = companySizeLabel(campaign.companySizeMin, campaign.companySizeMax);
  const drafted = await draftSequenceForClient({
    clientId: campaign.clientId,
    staffUserId: campaign.createdByStaffUserId,
    campaignBrief: [
      campaign.brief,
      `Job titles: ${campaign.jobTitles.join(", ")}`,
      `Countries: ${campaign.countries.join(", ")}`,
      `Industries: ${campaign.industries.join(", ")}`,
      size ? `Company size: ${size}` : null,
    ].filter((line): line is string => line !== null).join("\n"),
    revisionNotes: campaign.reviewFeedback ?? undefined,
  });
  if (!drafted.ok) throw new Error(drafted.reason);
  await setSequenceSteps({
    sequenceId: structure.sequenceId,
    clientId: campaign.clientId,
    targetStatus: "DRAFT",
    steps: drafted.steps.map((step, index) => ({
      category: step.category,
      templateId: drafted.templateIds[index] ?? "",
      delayDays: step.delayDays,
      delayHours: 0,
    })),
  });
  return { draftReady: true };
}

async function reviewEmails(campaign: CampaignRow): Promise<AiCampaignOutcome & { reviewFeedback: string }> {
  if (!campaign.sequenceId) throw new Error("The emails are not ready to check yet.");
  const review = await reviewCampaign({
    clientId: campaign.clientId,
    sequenceId: campaign.sequenceId,
    staffUserId: campaign.createdByStaffUserId,
  });
  if (!review.ok) throw new Error(review.reason);
  return {
    reviewScore: review.score,
    reviewFeedback: reviewFeedbackText(review.summary, review.findings),
  };
}

async function approveEmails(campaign: CampaignRow, actorId: string): Promise<AiCampaignOutcome> {
  if (!campaign.sequenceId) throw new Error("There is no email sequence to approve.");
  const steps = await prisma.clientEmailSequenceStep.findMany({
    where: { sequenceId: campaign.sequenceId },
    select: {
      template: { select: { id: true, status: true, systemApprovalKind: true } },
    },
  });
  for (const step of steps) {
    let status = step.template.status;
    let guard = 0;
    while (guard < 3) {
      guard += 1;
      const action = templateMachineApprovalStep(status, step.template.systemApprovalKind);
      if (action === "skip") break;
      if (action === "refuse") throw new Error("An archived email cannot be approved.");
      if (action === "mark_ready") {
        await markTemplateReadyForReview({
          templateId: step.template.id,
          clientId: campaign.clientId,
          staffUserId: actorId,
        });
        status = "READY_FOR_REVIEW";
        continue;
      }
      await approveTemplate({
        templateId: step.template.id,
        clientId: campaign.clientId,
        staffUserId: actorId,
        systemApprovalKind: "AI",
      });
      await prisma.auditLog.create({
        data: {
          staffUserId: actorId,
          clientId: campaign.clientId,
          action: "UPDATE",
          entityType: "ClientEmailTemplate",
          entityId: step.template.id,
          metadata: {
            systemApprovalKind: AI_CAMPAIGN_SYSTEM_APPROVAL,
            campaignId: campaign.id,
            note: "Approved by the AI campaign after the writing check passed.",
          },
        },
      });
      status = "APPROVED";
    }
  }

  const sequence = await prisma.clientEmailSequence.findFirst({
    where: { id: campaign.sequenceId, clientId: campaign.clientId },
    select: { status: true },
  });
  if (!sequence) throw new Error("The email sequence was not found.");
  let sequenceStatus = sequence.status;
  let sequenceGuard = 0;
  while (sequenceGuard < 3) {
    sequenceGuard += 1;
    const action = sequenceMachineApprovalStep(sequenceStatus);
    if (action === "skip") break;
    if (action === "refuse") throw new Error("An archived sequence cannot be approved.");
    if (action === "mark_ready") {
      await markSequenceReadyForReview({
        sequenceId: campaign.sequenceId,
        clientId: campaign.clientId,
        staffUserId: actorId,
      });
      sequenceStatus = "READY_FOR_REVIEW";
      continue;
    }
    await approveSequence({
      sequenceId: campaign.sequenceId,
      clientId: campaign.clientId,
      staffUserId: actorId,
    });
    sequenceStatus = "APPROVED";
  }
  return { templatesApproved: true };
}

/**
 * The manual Review recipients button throws when nobody new can be added.
 * A running campaign hits that on every later tick once the list is enrolled.
 * Keep going when people are already on the sequence. Still fail closed when
 * the list is empty, the sequence is archived, or nobody sendable was enrolled.
 */
async function enrollCampaignRecipients(input: {
  sequenceId: string;
  clientId: string;
  staffUserId: string;
}): Promise<void> {
  try {
    await enrollSequenceContacts(input);
  } catch (error) {
    if (!(error instanceof EnrollmentFailure) || error.code !== "NO_ELIGIBLE_CONTACTS") throw error;
    const existing = await prisma.clientEmailSequenceEnrollment.count({
      where: { sequenceId: input.sequenceId, clientId: input.clientId },
    });
    if (existing === 0) throw error;
    logger.info(
      { event: "ai_campaign_enroll_noop", sequenceId: input.sequenceId, clientId: input.clientId },
      "No new people to add. Existing recipients stay enrolled.",
    );
  }
}

async function prepareSend(campaign: CampaignRow, actorId: string): Promise<AiCampaignOutcome> {
  if (!campaign.sequenceId) throw new Error("There is no email sequence to prepare.");
  await enrollCampaignRecipients({
    sequenceId: campaign.sequenceId,
    clientId: campaign.clientId,
    staffUserId: actorId,
  });
  const intro = await prisma.clientEmailSequenceStep.findFirst({
    where: { sequenceId: campaign.sequenceId, category: "INTRODUCTION" },
    select: { id: true },
  });
  if (!intro) throw new Error("The introduction email is missing.");
  await planSequenceStepSends({
    clientId: campaign.clientId,
    sequenceId: campaign.sequenceId,
    stepId: intro.id,
    staffUserId: actorId,
  });
  return { sequencePrepared: true };
}

async function launchIntro(campaign: CampaignRow, actor: StaffUser): Promise<AiCampaignOutcome> {
  if (!campaign.sequenceId) throw new Error("There is no email sequence to send.");
  try {
    await sendSequenceStepBatch({
      staff: actor,
      clientId: campaign.clientId,
      sequenceId: campaign.sequenceId,
      category: "INTRODUCTION",
      confirmationPhrase: getSequenceStepSendConfirmationPhrase("INTRODUCTION"),
      initiatedByAutomation: true,
    });
    return { introStarted: true };
  } catch (error) {
    if (error instanceof SequenceStepSendError && error.code === "NO_READY_ROWS") {
      const started = await prisma.clientEmailSequenceStepSend.count({
        where: {
          sequenceId: campaign.sequenceId,
          OR: [
            { status: "SENT" },
            { outboundEmailId: { not: null } },
            { status: "READY", blockedReason: { contains: "pacing", mode: "insensitive" } },
          ],
        },
      });
      if (started > 0) return { introStarted: true };
    }
    throw error;
  }
}

async function continueSending(campaign: CampaignRow, actor: StaffUser): Promise<AiCampaignOutcome> {
  if (!campaign.sequenceId || !campaign.contactListId) {
    throw new Error("This campaign is not ready to keep sending.");
  }
  await enrollCampaignRecipients({
    sequenceId: campaign.sequenceId,
    clientId: campaign.clientId,
    staffUserId: actor.id,
  });
  const intro = await prisma.clientEmailSequenceStep.findFirst({
    where: { sequenceId: campaign.sequenceId, category: "INTRODUCTION" },
    select: { id: true },
  });
  if (intro) {
    await planSequenceStepSends({
      clientId: campaign.clientId,
      sequenceId: campaign.sequenceId,
      stepId: intro.id,
      staffUserId: actor.id,
    });
    try {
      await launchIntro(campaign, actor);
    } catch (error) {
      if (!(error instanceof SequenceStepSendError) || error.code !== "NO_READY_ROWS") throw error;
    }
  }
  await advanceDueSequenceFollowUps({
    clientId: campaign.clientId,
    sequenceIds: [campaign.sequenceId],
  });
  const pendingWork = await prisma.clientEmailSequenceEnrollment.count({
    where: { sequenceId: campaign.sequenceId, status: { in: ["PENDING", "PAUSED"] } },
  });
  return { introStarted: true, pendingWork };
}

async function buildSnapshot(campaign: CampaignRow, now: Date): Promise<AiCampaignSnapshot> {
  const [committed, committedToday, balance] = await Promise.all([
    committedCredits(campaign.id),
    committedCredits(campaign.id, startOfUtcDay(now)),
    loadBalance(),
  ]);
  const allowance = creditsAllowedForAiCampaign({
    creditBudgetTotal: campaign.creditBudgetTotal,
    creditsCommitted: committed,
    creditBudgetPerDay: campaign.creditBudgetPerDay,
    creditsCommittedToday: committedToday,
    balance,
    balanceFloor: balanceFloor(),
  });
  let draftReady = false;
  let templatesApproved = false;
  let sequencePrepared = false;
  let introStarted = false;
  let pendingWork = 0;
  let unenrolledReady = 0;
  if (campaign.sequenceId) {
    // sequence.status APPROVED only means templates were approved — not that
    // enroll + planSequenceStepSends has run. Treating APPROVED as "prepared"
    // skips prepare and launch fails with NO_READY_ROWS (0 enrollments).
    const [steps, started, pending, planned, ready] = await Promise.all([
      prisma.clientEmailSequenceStep.findMany({
        where: { sequenceId: campaign.sequenceId },
        select: { template: { select: { status: true, systemApprovalKind: true } } },
      }),
      prisma.clientEmailSequenceStepSend.count({
        where: {
          sequenceId: campaign.sequenceId,
          OR: [{ status: "SENT" }, { outboundEmailId: { not: null } }],
        },
      }),
      prisma.clientEmailSequenceEnrollment.count({
        where: { sequenceId: campaign.sequenceId, status: { in: ["PENDING", "PAUSED"] } },
      }),
      prisma.clientEmailSequenceStepSend.count({
        where: { sequenceId: campaign.sequenceId },
      }),
      campaign.contactListId
        ? countReadyNotEnrolled(campaign.clientId, campaign.sequenceId, campaign.contactListId)
        : Promise.resolve(0),
    ]);
    draftReady = steps.length > 0;
    templatesApproved = steps.length > 0 && steps.every((step) => step.template.status === "APPROVED");
    sequencePrepared = planned > 0 || started > 0;
    introStarted = started > 0;
    pendingWork = pending;
    unenrolledReady = ready;
  }
  return aiCampaignSnapshot({
    status: campaign.status,
    resumeStatus: campaign.resumeStatus,
    killSwitchOn: isAiCampaignsEnabled(),
    now,
    endsAt: campaign.endsAt,
    targetContactCount: campaign.targetContactCount,
    contactsSourced: campaign.contactsSourced,
    creditsAllowed: allowance.allowed,
    reviewScore: campaign.reviewScore,
    reviewRounds: campaign.reviewRounds,
    listExhausted: campaign.listExhausted,
    draftReady,
    templatesApproved,
    sequencePrepared,
    introStarted,
    pendingWork,
    unenrolledReady,
    lowWater: AI_CAMPAIGN_LOW_WATER,
    consecutiveFailures: campaign.consecutiveFailures,
  });
}

async function saveCampaign(
  campaign: CampaignRow,
  snapshot: AiCampaignSnapshot,
  extras: {
    searchStart?: number;
    creditsUsed?: number;
    reviewFeedback?: string;
    staffAlert?: string | null;
    contactListId?: string;
    sequenceId?: string;
    researchPlanId?: string;
    detail?: string;
    now: Date;
  },
): Promise<void> {
  await prisma.aiOutreachCampaign.update({
    where: { id: campaign.id },
    data: {
      status: snapshot.status,
      resumeStatus: snapshot.resumeStatus,
      contactsSourced: snapshot.contactsSourced,
      listExhausted: snapshot.listExhausted,
      reviewScore: snapshot.reviewScore,
      reviewRounds: snapshot.reviewRounds,
      consecutiveFailures: snapshot.consecutiveFailures,
      creditsUsed: extras.creditsUsed ?? campaign.creditsUsed,
      searchStart: extras.searchStart ?? campaign.searchStart,
      reviewFeedback: extras.reviewFeedback ?? campaign.reviewFeedback,
      staffAlert: extras.staffAlert === undefined ? campaign.staffAlert : extras.staffAlert,
      contactListId: extras.contactListId ?? campaign.contactListId,
      sequenceId: extras.sequenceId ?? campaign.sequenceId,
      researchPlanId: extras.researchPlanId ?? campaign.researchPlanId,
      pausedAt: snapshot.status === "PAUSED" ? extras.now : snapshot.status === "RUNNING" ? null : undefined,
      stoppedAt: snapshot.status === "STOPPED" ? extras.now : undefined,
      completedAt: snapshot.status === "COMPLETED" ? extras.now : undefined,
      nextActionAt: new Date(extras.now.getTime() + AI_CAMPAIGN_TICK_BACKOFF_MS),
      tickLockUntil: null,
    },
  });
}

async function perform(
  campaign: CampaignRow,
  decision: AiCampaignDecision,
  actor: StaffUser,
  allowance: number,
  now: Date,
): Promise<{ outcome: AiCampaignOutcome; extras: Parameters<typeof saveCampaign>[2] }> {
  const extras: Parameters<typeof saveCampaign>[2] = { now };
  if (decision.type === "source") {
    const sourced = await sourcePeople(campaign, allowance, now);
    extras.searchStart = sourced.searchStart;
    extras.creditsUsed = sourced.creditsUsed;
    extras.detail = sourced.detail;
    extras.contactListId = sourced.contactListId;
    extras.sequenceId = sourced.sequenceId;
    extras.researchPlanId = sourced.researchPlanId;
    return {
      outcome: { contactsSourced: sourced.contactsSourced, listExhausted: sourced.listExhausted },
      extras,
    };
  }
  if (decision.type === "write") {
    const structure = await ensureStructure(campaign);
    extras.contactListId = structure.contactListId;
    extras.sequenceId = structure.sequenceId;
    extras.researchPlanId = structure.researchPlanId;
    if (campaign.status === "SOURCING") {
      await prisma.aiOutreachCampaign.update({
        where: { id: campaign.id },
        data: { status: "WRITING", contactListId: structure.contactListId, sequenceId: structure.sequenceId, researchPlanId: structure.researchPlanId },
      });
    }
    const outcome = await writeEmails({ ...campaign, ...structure });
    return { outcome, extras };
  }
  if (decision.type === "review") {
    const reviewed = await reviewEmails(campaign);
    extras.reviewFeedback = reviewed.reviewFeedback;
    return { outcome: { reviewScore: reviewed.reviewScore }, extras };
  }
  if (decision.type === "approve") {
    return { outcome: await approveEmails(campaign, actor.id), extras };
  }
  if (decision.type === "prepare") {
    return { outcome: await prepareSend(campaign, actor.id), extras };
  }
  if (decision.type === "launch" || decision.type === "run") {
    const outcome = decision.type === "launch"
      ? await launchIntro(campaign, actor)
      : await continueSending(campaign, actor);
    return { outcome, extras };
  }
  if (decision.type === "pause" || decision.type === "stop" || decision.type === "complete") {
    if (campaign.sequenceId) await holdUnsentAiCampaignMail(campaign.clientId, campaign.sequenceId);
    return { outcome: {}, extras };
  }
  if (decision.type === "needs_staff") {
    extras.staffAlert = decision.reason;
    if (campaign.sequenceId) await holdUnsentAiCampaignMail(campaign.clientId, campaign.sequenceId);
    await prisma.auditLog.create({
      data: {
        staffUserId: actor.id,
        clientId: campaign.clientId,
        action: "UPDATE",
        entityType: "AiOutreachCampaign",
        entityId: campaign.id,
        metadata: { staffAlert: decision.reason },
      },
    });
    return { outcome: {}, extras };
  }
  return { outcome: {}, extras };
}

async function tickOne(campaign: CampaignRow, now: Date): Promise<string | null> {
  const locked = await prisma.aiOutreachCampaign.updateMany({
    where: {
      id: campaign.id,
      OR: [{ tickLockUntil: null }, { tickLockUntil: { lt: now } }],
    },
    data: { tickLockUntil: new Date(now.getTime() + LOCK_MS), lastTickedAt: now },
  });
  if (locked.count !== 1) return null;

  try {
    const actor = await loadActor();
    if (!actor) throw new Error("No admin is available to run this AI campaign.");
    const snapshot = await buildSnapshot(campaign, now);
    let decision = decideAiCampaignTick(snapshot);
    if (decision.type === "write" && snapshot.status !== "WRITING" && snapshot.status !== "REVISING") {
      await prisma.aiOutreachCampaign.update({ where: { id: campaign.id }, data: { status: "WRITING" } });
    }
    const performed = await perform(campaign, decision, actor, snapshot.creditsAllowed, now);
    let next = reduceAiCampaign(
      decision.type === "write" && snapshot.status === "SOURCING"
        ? { ...snapshot, status: "WRITING" }
        : snapshot,
      decision,
      performed.outcome,
    );
    if (decision.type === "source") {
      const follow = decideAiCampaignTick({ ...next, status: snapshot.status === "RUNNING" ? "RUNNING" : "SOURCING" });
      if (follow.type === "needs_staff") {
        decision = follow;
        next = reduceAiCampaign(next, follow);
        performed.extras.staffAlert = follow.reason;
      } else if (follow.type === "write" && snapshot.status === "SOURCING") {
        next = { ...next, status: "WRITING" };
      }
    }
    if (
      performed.extras.staffAlert === undefined &&
      decision.type !== "hold" &&
      decision.type !== "idle"
    ) {
      performed.extras.staffAlert = null;
    }
    await saveCampaign(campaign, next, performed.extras);
    const message = decision.type === "source" && performed.extras.detail
      ? `${aiCampaignDecisionMessage(decision)} ${performed.extras.detail}`
      : aiCampaignDecisionMessage(decision);
    if (decision.type === "hold" || decision.type === "idle") {
      await appendEventOnce(campaign.id, next.status, decision.type, message);
    } else {
      await appendEvent(campaign.id, next.status, decision.type === "needs_staff" ? "alert" : "info", message);
    }
    if (decision.type === "needs_staff") return message;
    return null;
  } catch (error) {
    const message = sanitizeJobErrorText(error instanceof Error ? error.message : "The AI campaign tick failed.");
    const failed = resolveAiCampaignTickFailure(aiCampaignSnapshot({
      status: campaign.status,
      consecutiveFailures: campaign.consecutiveFailures,
    }), message, now);
    await prisma.aiOutreachCampaign.update({
      where: { id: campaign.id },
      data: {
        status: failed.snapshot.status,
        consecutiveFailures: failed.snapshot.consecutiveFailures,
        staffAlert: failed.staffAlert === undefined ? campaign.staffAlert : failed.staffAlert,
        ...(failed.nextActionAt ? { nextActionAt: failed.nextActionAt } : {}),
        tickLockUntil: null,
      },
    });
    await appendEvent(campaign.id, failed.snapshot.status, failed.eventKind, failed.eventMessage);
    if (failed.holdUnsentMail && campaign.sequenceId) {
      await holdUnsentAiCampaignMail(campaign.clientId, campaign.sequenceId);
    }
    if (failed.jobError) {
      logger.error({ event: "ai_campaign_tick", campaignId: campaign.id }, message);
    } else {
      logger.warn({ event: "ai_campaign_tick_retry", campaignId: campaign.id }, message);
    }
    return failed.jobError;
  }
}

const SELECT = {
  id: true,
  clientId: true,
  name: true,
  status: true,
  resumeStatus: true,
  brief: true,
  jobTitles: true,
  countries: true,
  industries: true,
  seniorities: true,
  companySizeMin: true,
  companySizeMax: true,
  targetContactCount: true,
  creditBudgetTotal: true,
  creditBudgetPerDay: true,
  creditsUsed: true,
  searchStart: true,
  endsAt: true,
  contactListId: true,
  sequenceId: true,
  researchPlanId: true,
  reviewScore: true,
  reviewRounds: true,
  reviewFeedback: true,
  contactsSourced: true,
  listExhausted: true,
  staffAlert: true,
  consecutiveFailures: true,
  createdByStaffUserId: true,
} as const;

/** One step for every AI campaign on this client. Called from the five-minute tick. */
export async function tickAiCampaignsForClient(clientId: string): Promise<{ processed: number; errors: string[] }> {
  if (!isAiCampaignsEnabled()) return { processed: 0, errors: [] };
  const now = new Date();
  const rows = await prisma.aiOutreachCampaign.findMany({
    where: {
      clientId,
      status: { notIn: ["STOPPED", "COMPLETED", "FAILED", "PAUSED", "NEEDS_STAFF"] },
    },
    select: SELECT,
  });
  const errors: string[] = [];
  for (const row of rows) {
    const error = await tickOne(row, now);
    if (error) errors.push(error);
  }
  return { processed: rows.length, errors };
}
