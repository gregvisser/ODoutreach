import { NextRequest, NextResponse } from "next/server";

import { jobOutcome, jobResponseBody } from "@/lib/alerts/job-outcome";

import { listReplySyncMailboxIds, syncActiveClientMailboxInboxes } from "@/server/mailbox/mailbox-inbox-sync";

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
    batchProtocol?: number;
    planOnly?: boolean;
    perMailboxTop?: number;
    mailboxId?: string;
  };
  if (!body || typeof body !== "object" || body.batchProtocol !== 1) {
    return NextResponse.json({ error: "Use reply-sync batch protocol 1" }, { status: 409 });
  }
  if (body.planOnly === true) {
    return NextResponse.json({ batchProtocol: 1, mailboxIds: await listReplySyncMailboxIds() });
  }
  const perMailboxTop =
    typeof body.perMailboxTop === "number" && Number.isFinite(body.perMailboxTop) && body.perMailboxTop >= 1
      ? Math.min(Math.trunc(body.perMailboxTop), 10)
      : 10;
  if (typeof body.mailboxId !== "string" || body.mailboxId.length > 200 || !body.mailboxId.trim()) {
    return NextResponse.json({ error: "A mailbox from the sync plan is required" }, { status: 400 });
  }

  // One mailbox per request keeps a whole estate plus backlog out of Azure's
  // four-minute gateway window. Callers walk the snapshot, even after a failure.
  const result = await syncActiveClientMailboxInboxes({ perMailboxTop, maxMailboxes: 1, mailboxId: body.mailboxId });

  // `ok` is DERIVED from the result, not asserted. This line used to read
  // `{ ok: true, ...result }` — a literal written before anyone looked at
  // `result` — which is how a run went green while 8 of 35 mailboxes were
  // failing. A partial batch now answers 207 and `ok: false`.
  return NextResponse.json({ ...jobResponseBody(result), batchProtocol: 1 }, {
    status: jobOutcome(result).status,
  });
}
