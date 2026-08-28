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

  // `{"dryRun":true}` asks every configured sheet what it WOULD do — which tab
  // it resolves to, how many rows it holds, whether the shrink guard would
  // refuse — and writes nothing at all.
  //
  // Opt-in and strictly `=== true`. The cron posts `{}` and must keep writing:
  // a dry run reached by accident would leave every blocklist frozen while
  // reporting success, which is a quieter version of the outage this route was
  // built to fix. An unreadable body is a real sync, never a dry one.
  let dryRun = false;
  try {
    const body: unknown = await req.json();
    dryRun =
      typeof body === "object" &&
      body !== null &&
      (body as Record<string, unknown>).dryRun === true;
  } catch {
    dryRun = false;
  }

  try {
    const result = await syncAllConfiguredSuppressionSources({ dryRun });
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
