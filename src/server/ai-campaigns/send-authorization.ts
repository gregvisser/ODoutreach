import "server-only";

import { prisma } from "@/lib/db";
import {
  aiCampaignSequenceHeldFromAutoSend,
  isAiCampaignsEnabled,
} from "@/lib/ai-campaigns/policy";
import { resolveAutonomousRelayState } from "@/server/safety/autonomous-mode";

/**
 * An automated send for a sequence that belongs to a running AI campaign.
 * This does not turn on Machine sending for the client. Human sequences
 * still need that switch. The relay allowlist still applies.
 */
export async function aiCampaignAllowsAutomatedSend(input: {
  clientId: string;
  sequenceId: string;
  now?: Date;
}): Promise<boolean> {
  if (!isAiCampaignsEnabled()) return false;
  const now = input.now ?? new Date();
  const campaign = await prisma.aiOutreachCampaign.findFirst({
    where: {
      clientId: input.clientId,
      sequenceId: input.sequenceId,
      status: { in: ["RUNNING", "LAUNCHING"] },
    },
    select: {
      endsAt: true,
      client: { select: { slug: true, status: true, deletedAt: true } },
    },
  });
  if (!campaign) return false;
  if (campaign.client.deletedAt || campaign.client.status !== "ACTIVE") return false;
  if (campaign.endsAt && now.getTime() >= campaign.endsAt.getTime()) return false;
  const relay = resolveAutonomousRelayState();
  if (relay.active) {
    const slug = campaign.client.slug.trim().toLowerCase();
    const allowed = relay.allowlist
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.length > 0);
    if (!allowed.includes(slug)) return false;
  }
  return true;
}

/** Sequences whose pacing holds must wait. Human sequences are not in this list. */
export async function aiCampaignSequenceIdsHeldFromAutoSend(clientId: string): Promise<string[]> {
  const rows = await prisma.aiOutreachCampaign.findMany({
    where: { clientId, sequenceId: { not: null } },
    select: { sequenceId: true, status: true },
  });
  const killSwitchOn = isAiCampaignsEnabled();
  const held: string[] = [];
  for (const row of rows) {
    if (!row.sequenceId) continue;
    if (aiCampaignSequenceHeldFromAutoSend({ killSwitchOn, status: row.status })) {
      held.push(row.sequenceId);
    }
  }
  return held;
}
