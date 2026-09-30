import "server-only";

import { formatClientBriefPrefill } from "@/lib/ai-campaigns/audience";
import {
  aiCampaignStageSentence,
  aiCampaignStatusLabel,
  companySizeLabel,
} from "@/lib/ai-campaigns/copy";
import { isAiCampaignsEnabled, OPEN_AI_CAMPAIGN_STATUSES } from "@/lib/ai-campaigns/policy";
import type { AiCampaignStatus } from "@/lib/ai-campaigns/state-machine";
import type { AiCampaignListItem } from "@/lib/ai-campaigns/view";
import { prisma } from "@/lib/db";
import { isMailboxExecutionEligible } from "@/server/mailbox/sending-policy";

function asStatus(status: string): AiCampaignStatus {
  return status as AiCampaignStatus;
}

export type { AiCampaignListItem };

export type AiCampaignCreateContext = {
  clientName: string;
  clientStatus: string;
  prefillBrief: string;
  knownJobTitles: string[];
  knownIndustries: string[];
  campaigns: AiCampaignListItem[];
  openCampaignId: string | null;
  killSwitchOn: boolean;
};

export async function loadAiCampaignCreateContext(clientId: string): Promise<AiCampaignCreateContext | null> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, deletedAt: null },
    select: {
      name: true,
      status: true,
      industry: true,
      notes: true,
      briefTaxonomyLinks: { select: { term: { select: { kind: true, displayValue: true } } } },
    },
  });
  if (!client) return null;
  const byKind = (kind: string): string[] =>
    client.briefTaxonomyLinks
      .filter((link) => link.term.kind === kind)
      .map((link) => link.term.displayValue);
  const rows = await prisma.aiOutreachCampaign.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: { id: true, name: true, status: true },
  });
  const campaigns = rows.map((row) => ({
    id: row.id,
    name: row.name,
    status: asStatus(row.status),
    statusLabel: aiCampaignStatusLabel(asStatus(row.status)),
  }));
  const open = campaigns.find((row) =>
    (OPEN_AI_CAMPAIGN_STATUSES as readonly string[]).includes(row.status),
  );
  return {
    clientName: client.name,
    clientStatus: client.status,
    prefillBrief: formatClientBriefPrefill({
      clientName: client.name,
      industry: client.industry,
      notes: client.notes,
      serviceAreas: byKind("SERVICE_AREA"),
      targetIndustries: byKind("TARGET_INDUSTRY"),
      targetJobTitles: byKind("JOB_TITLE"),
      companySizes: byKind("COMPANY_SIZE"),
    }),
    knownJobTitles: byKind("JOB_TITLE"),
    knownIndustries: byKind("TARGET_INDUSTRY"),
    campaigns,
    openCampaignId: open?.id ?? null,
    killSwitchOn: isAiCampaignsEnabled(),
  };
}

export type AiCampaignDetail = {
  id: string;
  name: string;
  status: AiCampaignStatus;
  statusLabel: string;
  stageSentence: string;
  brief: string;
  jobTitles: string[];
  countries: string[];
  industries: string[];
  seniorities: string[];
  companySize: string | null;
  targetContactCount: number;
  contactsSourced: number;
  sent: number;
  replied: number;
  creditsUsed: number;
  creditBudgetTotal: number;
  creditBudgetPerDay: number;
  endsAt: Date | null;
  nextActionAt: Date | null;
  reviewScore: number | null;
  reviewRounds: number;
  staffAlert: string | null;
  listExhausted: boolean;
  killSwitchOn: boolean;
  mailboxes: { email: string; label: string }[];
  events: { id: string; at: Date; message: string }[];
};

export async function loadAiCampaignDetail(
  clientId: string,
  campaignId: string,
): Promise<AiCampaignDetail | null> {
  const campaign = await prisma.aiOutreachCampaign.findFirst({
    where: { id: campaignId, clientId },
    include: {
      events: { orderBy: { at: "desc" }, take: 40, select: { id: true, at: true, message: true } },
    },
  });
  if (!campaign) return null;
  const sequenceId = campaign.sequenceId;
  const [creditsUsed, sent, replied, mailboxes] = await Promise.all([
    prisma.rocketReachCreditReservation.count({
      where: { aiOutreachCampaignId: campaign.id, state: { in: ["RESERVED", "CHARGED"] } },
    }),
    sequenceId
      ? prisma.clientEmailSequenceStepSend.count({
          where: { clientId, sequenceId, status: "SENT" },
        })
      : Promise.resolve(0),
    sequenceId
      ? prisma.inboundReply.count({
          where: {
            clientId,
            linkedOutbound: { sequenceStepSends: { some: { clientId, sequenceId } } },
          },
        })
      : Promise.resolve(0),
    prisma.clientMailboxIdentity.findMany({
      where: { clientId, workspaceRemovedAt: null },
      orderBy: { email: "asc" },
      select: {
        email: true,
        displayName: true,
        isActive: true,
        connectionStatus: true,
        canSend: true,
        isSendingEnabled: true,
        workspaceRemovedAt: true,
      },
    }),
  ]);
  const status = asStatus(campaign.status);
  return {
    id: campaign.id,
    name: campaign.name,
    status,
    statusLabel: aiCampaignStatusLabel(status),
    stageSentence: aiCampaignStageSentence(status, campaign.staffAlert),
    brief: campaign.brief,
    jobTitles: campaign.jobTitles,
    countries: campaign.countries,
    industries: campaign.industries,
    seniorities: campaign.seniorities,
    companySize: companySizeLabel(campaign.companySizeMin, campaign.companySizeMax),
    targetContactCount: campaign.targetContactCount,
    contactsSourced: campaign.contactsSourced,
    sent,
    replied,
    creditsUsed,
    creditBudgetTotal: campaign.creditBudgetTotal,
    creditBudgetPerDay: campaign.creditBudgetPerDay,
    endsAt: campaign.endsAt,
    nextActionAt: campaign.nextActionAt,
    reviewScore: campaign.reviewScore,
    reviewRounds: campaign.reviewRounds,
    staffAlert: campaign.staffAlert,
    listExhausted: campaign.listExhausted,
    killSwitchOn: isAiCampaignsEnabled(),
    mailboxes: mailboxes.map((mailbox) => {
      const eligible = isMailboxExecutionEligible(mailbox);
      const name = mailbox.displayName?.trim() || mailbox.email;
      return {
        email: mailbox.email,
        label: eligible
          ? `${name} is connected and can send.`
          : `${name} is not sending. That mailbox is paused on its own. The others keep going.`,
      };
    }),
    events: campaign.events,
  };
}
