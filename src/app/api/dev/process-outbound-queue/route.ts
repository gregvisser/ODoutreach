import { NextRequest, NextResponse } from "next/server";

import { processOutboundSendQueue } from "@/server/email/outbound/queue-processor";

export const runtime = "nodejs";

/**
 * Dev: manually drain outbound queue (same processor as production).
 * Header `x-dev-secret: OUTBOUND_DEV_QUEUE_SECRET` or match PROCESS_QUEUE_SECRET.
 */
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEV_OUTBOUND_QUEUE !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const dev = process.env.OUTBOUND_DEV_QUEUE_SECRET?.trim();
  const shared = process.env.PROCESS_QUEUE_SECRET?.trim();
  const secret = req.headers.get("x-dev-secret");
  const ok =
    (dev && secret === dev) ||
    (shared && req.headers.get("authorization") === `Bearer ${shared}`);

  if (!ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let limit = 10;
  try {
    const body = (await req.json().catch(() => ({}))) as { limit?: number };
    if (typeof body.limit === "number") limit = body.limit;
  } catch {
    /* default */
  }

  try {
    const result = await processOutboundSendQueue({ limit: Math.min(limit, 50) });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
