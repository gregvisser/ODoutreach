import { NextRequest, NextResponse } from "next/server";

import { jobOutcome, jobResponseBody } from "@/lib/alerts/job-outcome";
import {
  combineProcessQueueResults,
  organisationJobsStatus,
  runOrganisationJobs,
} from "@/lib/tenant/organisation-jobs";

import { processOutboundSendQueue } from "@/server/email/outbound/queue-processor";
import { listOrganisationJobTargets } from "@/server/tenant/organisation-jobs";

export const runtime = "nodejs";

/**
 * Drain outbound send queue (Bearer PROCESS_QUEUE_SECRET).
 * Intended for cron, a small worker VM, or fire-and-forget after enqueue when INTERNAL_APP_URL is set.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.PROCESS_QUEUE_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "Queue processor not configured" }, { status: 503 });
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let limit = 10;
  try {
    const body = (await req.json().catch(() => ({}))) as { limit?: number };
    if (typeof body.limit === "number" && body.limit > 0) {
      limit = Math.min(body.limit, 50);
    }
  } catch {
    /* use default */
  }

  try {
    // One organisation's claim or send throw must not skip the next
    // organisation's queued mail. OpensDoors is the only production
    // organisation, so this is still one drain of its own clients.
    const targets = await listOrganisationJobTargets();
    const run = await runOrganisationJobs(
      targets,
      (target) => processOutboundSendQueue({ limit, clientIds: target.clientIds }),
      { succeeded: (result) => result.errors.length === 0 },
    );
    const result = {
      ...combineProcessQueueResults(run.organisations),
      organisations: run.organisations,
    };
    // `ok` is DERIVED from the result, not asserted. This line used to read
    // `{ ok: true, ...result }` — a literal written before anyone looked at
    // `result` — which is how a run went green while 8 of 35 mailboxes were
    // failing. A partial batch now answers 207 and `ok: false`.
    // Every active organisation throwing is 500, so a lone OpensDoors failure
    // still fails the cron.
    const outcome = jobOutcome(result);
    return NextResponse.json(jobResponseBody(result), {
      status: organisationJobsStatus(run.everyActiveFailed, outcome.status),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Queue failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
