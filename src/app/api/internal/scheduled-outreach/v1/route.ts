import { NextRequest, NextResponse } from "next/server";
import { loadScheduledOutreachPlan } from "@/server/mailbox/scheduled-outreach";
import { syncActiveClientMailboxInboxes } from "@/server/mailbox/mailbox-inbox-sync";
import { tickAiCampaignsForClient } from "@/server/ai-campaigns/tick";
import { advanceDueSequenceFollowUps } from "@/server/email-sequences/advance-due-followups";
import { resumePacingHeldSends } from "@/server/email-sequences/resume-pacing-holds";
import { processOutboundSendQueue } from "@/server/email/outbound/queue-processor";
import { sanitizeJobErrorText } from "@/lib/alerts/job-error-text";
import { jobOutcome, jobResponseBody } from "@/lib/alerts/job-outcome";
import {
  combineProcessQueueResults,
  organisationJobsStatus,
  runOrganisationJobs,
} from "@/lib/tenant/organisation-jobs";
import { targetsForClientIds } from "@/server/tenant/organisation-jobs";
import { recordSchedulerRun, recordSendQueueRun } from "@/server/ops/scheduler-heartbeat";

export const runtime = "nodejs";

/**
 * Pacing resume runs for every open calendar, including Human sending.
 * Follow-up advancement stays limited to clients that enabled Machine sending,
 * plus sequences owned by a running AI campaign.
 * The AI campaign tick is one step per campaign. It does not replace the
 * human send path. A pacing or follow-up error fails that client's tick.
 * An AI campaign throw is reported on that client and does not skip the
 * next client. A disconnected mailbox is a skip inside pacing resume and
 * does not by itself fail the run. The queue phase drains each organisation
 * on its own.
 */
async function runScheduledAdvance(clientId: string) {
  const pacing = await resumePacingHeldSends({ clientId });
  const advance = await advanceDueSequenceFollowUps({ clientId });
  // One client's tick throw stays on this request. The caller walks the
  // other clients, including clients in another organisation.
  let aiCampaigns: { processed: number; errors: string[] };
  try {
    aiCampaigns = await tickAiCampaignsForClient(clientId);
  } catch (error) {
    const detail = sanitizeJobErrorText(
      error instanceof Error && error.message.trim()
        ? error.message
        : "AI campaign tick failed",
    );
    aiCampaigns = { processed: 0, errors: [detail || "AI campaign tick failed"] };
  }
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
    if (body.phase === "plan") {
      // Every WebJob run starts here, day and night: the ops alert's proof
      // that the sender is alive.
      await recordSchedulerRun();
      const organisations = await targetsForClientIds(plan.clientIds);
      return NextResponse.json({ schedulerProtocol: 1, ok: true, ...plan, organisations });
    }
    if (body.phase === "sync" && !plan.mailboxIds.includes(body.mailboxId) || body.phase === "advance" && !plan.clientIds.includes(body.clientId)) {
      return NextResponse.json({ schedulerProtocol: 1, ok: true, skipped: true });
    }
    if (body.phase === "queue") {
      // The plan lists every open client. Drain each organisation on its own
      // so one organisation's claim failure cannot skip another's sends.
      // A single OpensDoors plan is still one drain of those client ids.
      const targets = await targetsForClientIds(plan.clientIds);
      const run = await runOrganisationJobs(
        targets,
        (target) => processOutboundSendQueue({ limit: 25, clientIds: target.clientIds }),
        { succeeded: (batch) => batch.errors.length === 0 },
      );
      const result = {
        ...combineProcessQueueResults(run.organisations),
        organisations: run.organisations,
      };
      const outcome = jobOutcome(result);
      await recordSendQueueRun({
        ok: result.errors.length === 0,
        error: result.errors.length ? sanitizeJobErrorText(result.errors.slice(0, 3).join("; ")) : null,
        claimed: result.claimed,
        completed: result.completed,
      });
      return NextResponse.json(
        { schedulerProtocol: 1, ...jobResponseBody(result) },
        { status: organisationJobsStatus(run.everyActiveFailed, outcome.status) },
      );
    }
    const result = body.phase === "sync"
      ? await syncActiveClientMailboxInboxes({ mailboxId: body.mailboxId, clientIds: plan.clientIds, maxMailboxes: 1, perMailboxTop: 10 })
      : await runScheduledAdvance(body.clientId);
    return NextResponse.json({ schedulerProtocol: 1, ...jobResponseBody(result) }, { status: jobOutcome(result).status });
  } catch (error) {
    const detail = sanitizeJobErrorText(
      error instanceof Error && error.message.trim()
        ? error.message
        : "Scheduled outreach could not complete",
    );
    if (body.phase === "queue") {
      await recordSendQueueRun({ ok: false, error: detail || "Sending failed", claimed: 0, completed: 0 });
    }
    return NextResponse.json(
      { schedulerProtocol: 1, ok: false, errors: [detail] },
      { status: 500 },
    );
  }
}
