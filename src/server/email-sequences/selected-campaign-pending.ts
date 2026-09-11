import "server-only";
import { prisma } from "@/lib/db";
import { AUTOMATED_SEQUENCE_SEND_ORIGIN } from "@/lib/email-sequences/send-origin";
import type { CampaignSchedulerSelection } from "@/lib/email-sequences/campaign-scheduler-selection";
import { validateFollowUpScope } from "@/lib/email-sequences/followup-scope";

/** Resume saved automatic follow-ups, never manual mail or uncertain dispatches. */
export async function loadSelectedCampaignPendingIds(selection: CampaignSchedulerSelection, now = new Date()) {
  validateFollowUpScope(selection);
  const rows = await prisma.outboundEmail.findMany({
    where: {
      clientId: selection.clientId,
      status: "QUEUED",
      dispatchStartedAt: null,
      providerMessageId: null,
      sentAt: null,
      metadata: { path: ["sendOrigin"], equals: AUTOMATED_SEQUENCE_SEND_ORIGIN },
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
      sequenceStepSends: { some: {
        clientId: selection.clientId,
        sequenceId: { in: selection.sequenceIds },
        status: "SENT",
        sequence: { clientId: selection.clientId, status: "APPROVED" },
        enrollment: { clientId: selection.clientId, status: "PENDING" },
        step: { category: { not: "INTRODUCTION" } },
        template: { status: "APPROVED" },
      } },
    },
    select: { id: true },
    orderBy: [{ queuedAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    take: 25,
  });
  return rows.map(row => row.id);
}

