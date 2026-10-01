import { NextRequest, NextResponse } from "next/server";

import { loadOutboundSendHealth } from "@/server/email/outbound/send-health";

export const runtime = "nodejs";

/**
 * Read-only per-client send health (Bearer PROCESS_QUEUE_SECRET).
 * Counts and ages only. It does not claim, send, pause, or launch.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.PROCESS_QUEUE_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "Send health is not configured" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await loadOutboundSendHealth());
  } catch {
    return NextResponse.json({ error: "Send health could not be read" }, { status: 500 });
  }
}
