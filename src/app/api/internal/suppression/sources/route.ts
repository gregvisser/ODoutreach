import { NextRequest, NextResponse } from "next/server";

import { listSuppressionSourceInventory } from "@/server/integrations/google-sheets/suppression-source-inventory";

export const runtime = "nodejs";

/**
 * What do-not-contact sheets exist and how many rows each list holds
 * (Bearer PROCESS_QUEUE_SECRET).
 *
 * READ ONLY, and reads the DATABASE ONLY — no Google call, no quota, no write.
 * A GET because it is a question; the thing that answers a question by first
 * deleting the answer is the sync, and it lives elsewhere.
 *
 * This exists because the source id — the handle for repairing one client's
 * list — was only ever printed by the dry run, which is sixty-eight paced
 * Google reads in one request and spent 2026-08-28 timing out. The tool for
 * fixing a broken blocklist must not be unreachable when blocklists are broken.
 */
export async function GET(req: NextRequest) {
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
    const inventory = await listSuppressionSourceInventory();
    // No `jobResponseBody` here, deliberately. That derives `ok` from failure
    // counts for a job that DID something; this ran no job. An empty list is a
    // true answer to the question asked, and dressing it as a failed run would
    // make a quiet estate indistinguishable from a broken one.
    return NextResponse.json(inventory);
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Could not list suppression sources";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
