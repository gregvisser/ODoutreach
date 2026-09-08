import { NextRequest, NextResponse } from "next/server";
import { loadScheduledOutreachPlan } from "@/server/mailbox/scheduled-outreach";
import { syncActiveClientMailboxInboxes } from "@/server/mailbox/mailbox-inbox-sync";
import { advanceDueSequenceFollowUps } from "@/server/email-sequences/advance-due-followups";
import { processOutboundSendQueue } from "@/server/email/outbound/queue-processor";
import { jobOutcome, jobResponseBody } from "@/lib/alerts/job-outcome";

export const runtime = "nodejs";

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
        ? await advanceDueSequenceFollowUps({ clientId: body.clientId })
        : await processOutboundSendQueue({ limit: 25, clientIds: plan.clientIds });
    return NextResponse.json({ schedulerProtocol: 1, ...jobResponseBody(result) }, { status: jobOutcome(result).status });
  } catch {
    return NextResponse.json({ schedulerProtocol: 1, ok: false, error: "Scheduled outreach could not complete" }, { status: 500 });
  }
}
