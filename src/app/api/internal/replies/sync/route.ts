import { NextRequest, NextResponse } from "next/server";

import { syncActiveClientMailboxInboxes } from "@/server/mailbox/mailbox-inbox-sync";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const secret = process.env.PROCESS_QUEUE_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "Reply sync not configured" }, { status: 503 });
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    perMailboxTop?: number;
    maxMailboxes?: number;
  };
  const perMailboxTop =
    typeof body.perMailboxTop === "number" && body.perMailboxTop > 0
      ? Math.min(body.perMailboxTop, 50)
      : 25;
  const maxMailboxes =
    typeof body.maxMailboxes === "number" && body.maxMailboxes > 0
      ? Math.min(body.maxMailboxes, 100)
      : 50;

  const result = await syncActiveClientMailboxInboxes({ perMailboxTop, maxMailboxes });
  return NextResponse.json({ ok: true, ...result });
}
