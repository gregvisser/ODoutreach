import "server-only";

import type { StaffUser } from "@/generated/prisma/client";
import type { AiCampaignDraft } from "@/lib/ai-campaigns/audience";
import { aiCampaignDecisionMessage } from "@/lib/ai-campaigns/copy";
import {
  AI_CAMPAIGN_PAUSE_PHRASE,
  AI_CAMPAIGN_RESUME_PHRASE,
  AI_CAMPAIGN_STOP_PHRASE,
  isAiCampaignConfirmation,
  isAiCampaignsEnabled,
  OPEN_AI_CAMPAIGN_STATUSES,
  staffMayControlAiCampaign,
} from "@/lib/ai-campaigns/policy";
import {
  aiCampaignSnapshot,
  decideAiCampaignTick,
  reduceAiCampaign,
  type AiCampaignCommand,
  type AiCampaignStatus,
} from "@/lib/ai-campaigns/state-machine";
import { prisma } from "@/lib/db";

import { holdUnsentAiCampaignMail } from "./tick";

type ControlResult = { ok: true; campaignId: string } | { ok: false; error: string };

const PHRASE_FOR_COMMAND: Record<Exclude<AiCampaignCommand, "tick">, string> = {
  pause: AI_CAMPAIGN_PAUSE_PHRASE,
  resume: AI_CAMPAIGN_RESUME_PHRASE,
  stop: AI_CAMPAIGN_STOP_PHRASE,
};

function asStatus(status: string): AiCampaignStatus {
  return status as AiCampaignStatus;
}

/**
 * Persist a campaign and nothing else.
 * The five-minute tick finds people, writes, checks, and sends.
 */
export async function startAiCampaign(input: {
  staff: Pick<StaffUser, "id" | "role">;
  clientId: string;
  draft: AiCampaignDraft;
}): Promise<ControlResult> {
  if (!staffMayControlAiCampaign(input.staff.role)) {
    return { ok: false, error: "You do not have permission to start an AI campaign." };
  }
  if (!isAiCampaignsEnabled()) {
    return { ok: false, error: "AI campaigns are switched off. Nothing was started." };
  }
  const { clientFeatureEnabled } = await import("@/server/tenant/feature-gate");
  if (!(await clientFeatureEnabled(input.clientId, "aiCampaigns", true))) {
    return { ok: false, error: "AI campaigns are switched off for this organisation. Nothing was started." };
  }
  const client = await prisma.client.findFirst({
    where: { id: input.clientId, deletedAt: null },
    select: { id: true, name: true, status: true },
  });
  if (!client) return { ok: false, error: "This client was not found." };
  if (client.status !== "ACTIVE") {
    return { ok: false, error: "The client must be Active before an AI campaign can start." };
  }
  const existing = await prisma.aiOutreachCampaign.findFirst({
    where: { clientId: client.id, status: { in: [...OPEN_AI_CAMPAIGN_STATUSES] } },
    select: { id: true },
  });
  if (existing) {
    return { ok: false, error: "This client already has an AI campaign in progress." };
  }

  const draft = input.draft;
  const created = await prisma.$transaction(async (tx) => {
    const campaign = await tx.aiOutreachCampaign.create({
      data: {
        clientId: client.id,
        name: `AI campaign — ${client.name}`.slice(0, 120),
        brief: draft.brief,
        jobTitles: draft.jobTitles,
        countries: draft.countries,
        industries: draft.industries,
        seniorities: draft.seniorities,
        companySizeMin: draft.companySizeMin,
        companySizeMax: draft.companySizeMax,
        targetContactCount: draft.targetContactCount,
        creditBudgetTotal: draft.creditBudgetTotal,
        creditBudgetPerDay: draft.creditBudgetPerDay,
        endsAt: draft.endsAt,
        createdByStaffUserId: input.staff.id,
        nextActionAt: new Date(),
      },
    });
    await tx.aiOutreachCampaignEvent.create({
      data: {
        campaignId: campaign.id,
        stage: "SOURCING",
        kind: "info",
        message: "A member of staff started this AI campaign. The next scheduled pass will look for people.",
      },
    });
    await tx.auditLog.create({
      data: {
        staffUserId: input.staff.id,
        clientId: client.id,
        action: "CREATE",
        entityType: "AiOutreachCampaign",
        entityId: campaign.id,
        metadata: {
          targetContactCount: draft.targetContactCount,
          creditBudgetTotal: draft.creditBudgetTotal,
          creditBudgetPerDay: draft.creditBudgetPerDay,
        },
      },
    });
    return campaign;
  });
  return { ok: true, campaignId: created.id };
}

/** Pause, resume, or stop. Stop still works when the kill switch is off. */
export async function applyAiCampaignCommand(input: {
  staff: Pick<StaffUser, "id" | "role">;
  clientId: string;
  campaignId: string;
  command: Exclude<AiCampaignCommand, "tick">;
  confirmationPhrase: string;
}): Promise<ControlResult> {
  if (!staffMayControlAiCampaign(input.staff.role)) {
    return { ok: false, error: "You do not have permission to change this AI campaign." };
  }
  const expected = PHRASE_FOR_COMMAND[input.command];
  if (!isAiCampaignConfirmation(input.confirmationPhrase, expected)) {
    return { ok: false, error: `Type ${expected} to continue.` };
  }
  const campaign = await prisma.aiOutreachCampaign.findFirst({
    where: { id: input.campaignId, clientId: input.clientId },
    select: { id: true, status: true, resumeStatus: true, sequenceId: true },
  });
  if (!campaign) return { ok: false, error: "This AI campaign was not found." };

  const now = new Date();
  const snapshot = aiCampaignSnapshot({
    status: asStatus(campaign.status),
    resumeStatus: campaign.resumeStatus ? asStatus(campaign.resumeStatus) : null,
    killSwitchOn: isAiCampaignsEnabled(),
    now,
  });
  const decision = decideAiCampaignTick(snapshot, input.command);
  if (decision.type === "idle" || decision.type === "hold") {
    return { ok: false, error: decision.reason };
  }
  if ((decision.type === "pause" || decision.type === "stop") && campaign.sequenceId) {
    await holdUnsentAiCampaignMail(input.clientId, campaign.sequenceId);
  }
  const next = reduceAiCampaign(snapshot, decision);
  await prisma.$transaction(async (tx) => {
    await tx.aiOutreachCampaign.update({
      where: { id: campaign.id },
      data: {
        status: next.status,
        resumeStatus: next.resumeStatus,
        pauseReason: decision.type === "pause" ? decision.reason : decision.type === "resume" ? null : undefined,
        pausedAt: next.status === "PAUSED" ? now : decision.type === "resume" ? null : undefined,
        stoppedAt: next.status === "STOPPED" ? now : undefined,
        nextActionAt: new Date(now.getTime() + 5 * 60 * 1000),
      },
    });
    await tx.aiOutreachCampaignEvent.create({
      data: {
        campaignId: campaign.id,
        stage: next.status,
        kind: decision.type === "stop" || decision.type === "pause" ? "alert" : "info",
        message: aiCampaignDecisionMessage(decision),
      },
    });
    await tx.auditLog.create({
      data: {
        staffUserId: input.staff.id,
        clientId: input.clientId,
        action: "UPDATE",
        entityType: "AiOutreachCampaign",
        entityId: campaign.id,
        metadata: { command: input.command, status: next.status },
      },
    });
  });
  return { ok: true, campaignId: campaign.id };
}
