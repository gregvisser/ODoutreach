import { NextRequest, NextResponse } from "next/server";

import { jobOutcome, jobResponseBody } from "@/lib/alerts/job-outcome";

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

  // `ok` is DERIVED from the result, not asserted. This line used to read
  // `{ ok: true, ...result }` — a literal written before anyone looked at
  // `result` — which is how a run went green while 8 of 35 mailboxes were
  // failing. A partial batch now answers 207 and `ok: false`.
  return NextResponse.json(jobResponseBody(result), {
    status: jobOutcome(result).status,
  });
}
