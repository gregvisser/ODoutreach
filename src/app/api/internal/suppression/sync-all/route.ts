import { NextRequest, NextResponse } from "next/server";

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
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Suppression sync failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
