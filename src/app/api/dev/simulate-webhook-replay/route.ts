import { NextRequest, NextResponse } from "next/server";

import { applyNormalizedEmailEvent } from "@/server/email/webhooks/outbound-provider-events";

export const runtime = "nodejs";

/**
 * Dev: POST twice with the same body to verify dedupe — second call should return replayDuplicate.
 * Header `x-dev-secret: OUTBOUND_DEV_WEBHOOK_REPLAY_SECRET` or `PROCESS_QUEUE_SECRET` bearer.
 */
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEV_WEBHOOK_REPLAY !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const dev = process.env.OUTBOUND_DEV_WEBHOOK_REPLAY_SECRET?.trim();
  const shared = process.env.PROCESS_QUEUE_SECRET?.trim();
  const ok =
    (dev && req.headers.get("x-dev-secret") === dev) ||
    (shared && req.headers.get("authorization") === `Bearer ${shared}`);

  if (!ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    providerMessageId?: string;
    eventType?: string;
    webhookMessageId?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const providerMessageId = String(body.providerMessageId ?? "").trim();
  if (!providerMessageId) {
    return NextResponse.json({ error: "providerMessageId required" }, { status: 400 });
  }

  const eventType = String(body.eventType ?? "email.delivered");
  const webhookMessageId =
    typeof body.webhookMessageId === "string" ? body.webhookMessageId : "dev_fixed_svix_id";

  const first = await applyNormalizedEmailEvent({
    providerName: "dev_replay",
    providerMessageId,
    eventType,
    createdAt: new Date(),
    rawPayload: { devReplay: 1 },
    webhookMessageId,
  });

  const second = await applyNormalizedEmailEvent({
    providerName: "dev_replay",
    providerMessageId,
    eventType,
    createdAt: new Date(),
    rawPayload: { devReplay: 2 },
    webhookMessageId,
  });

  return NextResponse.json({
    first,
    second,
    deduped: second.replayDuplicate === true,
  });
}
