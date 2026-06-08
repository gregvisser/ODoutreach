import { NextRequest, NextResponse } from "next/server";

import { advanceDueSequenceFollowUps } from "@/server/email-sequences/advance-due-followups";

export const runtime = "nodejs";

/**
 * Advance due sequence follow-ups (Bearer PROCESS_QUEUE_SECRET).
 *
 * Stages + dispatches any follow-up step whose delay has elapsed, for
 * every ACTIVE client. Creates QUEUED OutboundEmail rows — the outbound
 * queue processor then actually sends them. Intended to run from the
 * outbound cron immediately BEFORE the queue drain, so a due follow-up
 * is staged and sent in the same tick.
 *
 * Idempotent and delay-guarded (see advance-due-followups.ts): safe to
 * call every few minutes.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.PROCESS_QUEUE_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "Sequence advancer not configured" },
      { status: 503 },
    );
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let clientId: string | undefined;
  try {
    const body = (await req.json().catch(() => ({}))) as { clientId?: unknown };
    if (typeof body.clientId === "string" && body.clientId.trim().length > 0) {
      clientId = body.clientId.trim();
    }
  } catch {
    /* no body — advance all active clients */
  }

  try {
    const result = await advanceDueSequenceFollowUps(
      clientId ? { clientId } : undefined,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Follow-up advance failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
