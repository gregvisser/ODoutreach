import { NextRequest, NextResponse } from "next/server";

import { jobOutcome, jobResponseBody } from "@/lib/alerts/job-outcome";

import { syncAllConfiguredSuppressionSources } from "@/server/integrations/google-sheets/suppression-sync-all";

export const runtime = "nodejs";

/**
 * Re-sync every configured do-not-contact sheet (Bearer
 * PROCESS_QUEUE_SECRET). Called by the replies cron so DNC sheet edits
 * reach the suppression tables — and therefore the send-time gate —
 * without staff having to click "Sync now". Idempotent.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.PROCESS_QUEUE_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "Suppression sync not configured" },
      { status: 503 },
    );
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncAllConfiguredSuppressionSources();
    // `ok` is DERIVED from the result, not asserted. This line used to read
    // `{ ok: true, ...result }` — a literal written before anyone looked at
    // `result` — which is how a run went green while 8 of 35 mailboxes were
    // failing. A partial batch now answers 207 and `ok: false`.
    return NextResponse.json(jobResponseBody(result), {
      status: jobOutcome(result).status,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Suppression sync failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
