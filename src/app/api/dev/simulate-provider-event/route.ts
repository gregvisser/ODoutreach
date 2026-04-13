import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { applyNormalizedEmailEvent } from "@/server/email/webhooks/outbound-provider-events";

export const runtime = "nodejs";

type Body = {
  outboundEmailId?: string;
  eventType?: string;
};

/**
 * Dev: apply a synthetic provider lifecycle event to an existing outbound row (by id).
 * Requires `x-dev-secret: OUTBOUND_DEV_PROVIDER_EVENT_SECRET` or shared PROCESS_QUEUE_SECRET bearer.
 */
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEV_PROVIDER_SIMULATE !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const dev = process.env.OUTBOUND_DEV_PROVIDER_EVENT_SECRET?.trim();
  const shared = process.env.PROCESS_QUEUE_SECRET?.trim();
  const secret = req.headers.get("x-dev-secret");
  const ok =
    (dev && secret === dev) ||
    (shared && req.headers.get("authorization") === `Bearer ${shared}`);

  if (!ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const outboundEmailId = typeof body.outboundEmailId === "string" ? body.outboundEmailId : null;
  const eventType =
    typeof body.eventType === "string" ? body.eventType : "email.delivered";

  if (!outboundEmailId) {
    return NextResponse.json({ error: "outboundEmailId required" }, { status: 400 });
  }

  const ob = await prisma.outboundEmail.findUnique({
    where: { id: outboundEmailId },
    select: { providerMessageId: true },
  });

  if (!ob?.providerMessageId) {
    return NextResponse.json(
      { error: "Outbound not found or not yet sent (no providerMessageId)" },
      { status: 400 },
    );
  }

  const r = await applyNormalizedEmailEvent({
    providerName: "dev_simulate",
    providerMessageId: ob.providerMessageId,
    eventType,
    createdAt: new Date(),
    rawPayload: { dev: true, outboundEmailId, eventType },
  });

  return NextResponse.json({ ok: true, ...r });
}
