import "server-only";
import { processOutboundSendQueue } from "@/server/email/outbound/queue-processor";
import { prisma } from "@/lib/db";
import { parseCampaignSchedulerSelection } from "@/lib/email-sequences/campaign-scheduler-selection";
import { loadScheduledOutreachPlan } from "@/server/mailbox/scheduled-outreach";
import { listReplySyncMailboxIds, syncMailboxInboxForMailbox } from "@/server/mailbox/mailbox-inbox-sync";
import { advanceDueSequenceFollowUps } from "@/server/email-sequences/advance-due-followups";
import { loadSelectedCampaignPendingIds } from "./selected-campaign-pending";

/** Disabled unless a finite server-side selection exists. Never drains the shared queue. */
export async function runSelectedCampaignFollowUps(rawSelection: string | undefined) {
  const selection = parseCampaignSchedulerSelection(rawSelection);
  if (!selection) return { ok: true, skipped: true, reason: "not-configured" };
  const deadline = Date.now() + 90_000;
  const client = await prisma.client.findFirst({ where: { id: selection.clientId, status: "ACTIVE", deletedAt: null, autonomousSendEnabled: true }, select: { id: true } });
  if (!client) return { ok: true, skipped: true, reason: "client-consent-unavailable" };
  const plan = await loadScheduledOutreachPlan();
  if (!plan.clientIds.includes(selection.clientId)) return { ok: true, skipped: true, reason: "outside-sending-window" };
  const mailboxIds = await listReplySyncMailboxIds([selection.clientId]);
  if (!mailboxIds.length || mailboxIds.length > 20) return { ok: false, reason: "receiving-mailbox-plan-unavailable" };
  for (const mailboxIdentityId of mailboxIds) {
    if (Date.now() >= deadline) return { ok: false, reason: "receiving-budget-exhausted" };
    // A partial page is not proof that no reply exists. Resume on a later run.
    const result = await syncMailboxInboxForMailbox({ clientId: selection.clientId, mailboxIdentityId, staffUserId: null, top: 10 });
    if (!result.ok || result.backlogPending) return { ok: false, reason: "reply-sync-incomplete" };
  }
  if (Date.now() >= deadline) return { ok: false, reason: "receiving-budget-exhausted" };
  const current = await loadScheduledOutreachPlan();
  if (!current.clientIds.includes(selection.clientId)) return { ok: true, skipped: true, reason: "sending-window-closed" };
  // A previous run can stop after saving the queue rows but before waking the
  // worker. Resume a bounded selection only after receiving has caught up.
  const pendingIds = await loadSelectedCampaignPendingIds(selection);
  if (pendingIds.length > 0) {
    const window = await loadScheduledOutreachPlan();
    if (!window.clientIds.includes(selection.clientId)) return { ok: true, skipped: true, reason: "sending-window-closed" };
    const recovered = await processOutboundSendQueue({ limit: 25, dispatchScope: { clientId: selection.clientId, outboundEmailIds: pendingIds } });
    if (recovered.errors.length) return { ok: false, reason: "selected-queue-incomplete" };
  }
  // Existing dispatcher preserves consent, delay, suppression and atomic bookings.
  // It wakes only its newly created outbound IDs; no broad queue call is made here.
  const result = await advanceDueSequenceFollowUps({ ...selection, onQueued: async (clientId, ids) => {
    if (clientId !== selection.clientId) throw new Error("Campaign queue client mismatch");
    for (let offset = 0; offset < ids.length; offset += 25) {
      const currentWindow = await loadScheduledOutreachPlan();
      if (!currentWindow.clientIds.includes(clientId)) throw new Error("Sending window closed before queue dispatch");
      const queue = await processOutboundSendQueue({ limit: 25, dispatchScope: { clientId, outboundEmailIds: ids.slice(offset, offset + 25) } });
      if (queue.errors.length) throw new Error("Selected campaign queue did not complete");
    }
  } });
  return { ok: result.errors.length === 0, ...result };
}
