import { NextRequest, NextResponse } from "next/server";

import { processOutboundSendQueue } from "@/server/email/outbound/queue-processor";

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
    const result = await processOutboundSendQueue({ limit });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Queue failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
