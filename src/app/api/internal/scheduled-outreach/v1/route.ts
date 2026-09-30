import { NextRequest, NextResponse } from "next/server";
import { loadScheduledOutreachPlan } from "@/server/mailbox/scheduled-outreach";
import { syncActiveClientMailboxInboxes } from "@/server/mailbox/mailbox-inbox-sync";
import { tickAiCampaignsForClient } from "@/server/ai-campaigns/tick";
import { advanceDueSequenceFollowUps } from "@/server/email-sequences/advance-due-followups";
import { resumePacingHeldSends } from "@/server/email-sequences/resume-pacing-holds";
import { processOutboundSendQueue } from "@/server/email/outbound/queue-processor";
import { sanitizeJobErrorText } from "@/lib/alerts/job-error-text";
import { jobOutcome, jobResponseBody } from "@/lib/alerts/job-outcome";

export const runtime = "nodejs";

/**
 * Pacing resume runs for every open calendar, including Human sending.
 * Follow-up advancement stays limited to clients that enabled Machine sending,
 * plus sequences owned by a running AI campaign.
 * The AI campaign tick is one step per campaign. It does not replace the
 * human send path. Errors from any part fail the tick; a disconnected mailbox
 * is a skip inside pacing resume and does not by itself fail the run.
 */
async function runScheduledAdvance(clientId: string) {
  const pacing = await resumePacingHeldSends({ clientId });
  const advance = await advanceDueSequenceFollowUps({ clientId });
  const aiCampaigns = await tickAiCampaignsForClient(clientId);
  return {
    ...advance,
    pacing,
    aiCampaigns,
    skippedSteps: [...pacing.skippedSteps, ...advance.skippedSteps],
    errors: [...pacing.errors, ...advance.errors, ...aiCampaigns.errors],
  };
}

/** Versioned path: old deployments cannot silently ignore scheduled scoping. */
export async function POST(req: NextRequest) {
  const secret = process.env.PROCESS_QUEUE_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "Scheduler not configured" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || body.schedulerProtocol !== 1 || !["plan", "sync", "advance", "queue"].includes(body.phase)) {
    return NextResponse.json({ error: "Use scheduled outreach protocol 1" }, { status: 409 });
  }
  if ((body.phase === "sync" && (typeof body.mailboxId !== "string" || body.mailboxId.length > 200 || !body.mailboxId.trim())) ||
      (body.phase === "advance" && (typeof body.clientId !== "string" || body.clientId.length > 200 || !body.clientId.trim()))) {
    return NextResponse.json({ error: "A valid planned identifier is required" }, { status: 400 });
  }
  try {
    const plan = await loadScheduledOutreachPlan();
    if (body.phase === "plan") return NextResponse.json({ schedulerProtocol: 1, ok: true, ...plan });
    if (body.phase === "sync" && !plan.mailboxIds.includes(body.mailboxId) || body.phase === "advance" && !plan.clientIds.includes(body.clientId)) {
      return NextResponse.json({ schedulerProtocol: 1, ok: true, skipped: true });
    }
    const result = body.phase === "sync"
      ? await syncActiveClientMailboxInboxes({ mailboxId: body.mailboxId, clientIds: plan.clientIds, maxMailboxes: 1, perMailboxTop: 10 })
      : body.phase === "advance"
        ? await runScheduledAdvance(body.clientId)
        : await processOutboundSendQueue({ limit: 25, clientIds: plan.clientIds });
    return NextResponse.json({ schedulerProtocol: 1, ...jobResponseBody(result) }, { status: jobOutcome(result).status });
  } catch (error) {
    const detail = sanitizeJobErrorText(
      error instanceof Error && error.message.trim()
        ? error.message
        : "Scheduled outreach could not complete",
    );
    return NextResponse.json(
      { schedulerProtocol: 1, ok: false, errors: [detail] },
      { status: 500 },
    );
  }
}
