import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import {
  ingestInboundForClient,
  type InboundWebhookPayload,
} from "@/server/email/inbound/ingest";

export const runtime = "nodejs";

/**
 * Dev-only: POST with header `x-dev-secret: INBOUND_DEV_SIMULATE_SECRET`
 * Body: { "clientId": "...", "fromEmail": "...", ...InboundWebhookPayload }
 *
 * Disabled in production unless ALLOW_DEV_INBOUND_SIMULATE=true
 */
export async function POST(req: NextRequest) {
  const allow =
    process.env.NODE_ENV !== "production" ||
    process.env.ALLOW_DEV_INBOUND_SIMULATE === "true";
  if (!allow) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const devSecret = process.env.INBOUND_DEV_SIMULATE_SECRET?.trim();
  if (!devSecret || req.headers.get("x-dev-secret") !== devSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const clientId = typeof body.clientId === "string" ? body.clientId : null;
  if (!clientId) {
    return NextResponse.json({ error: "clientId required" }, { status: 400 });
  }

  const exists = await prisma.client.findFirst({
    where: { id: clientId },
    select: { id: true },
  });
  if (!exists) {
    return NextResponse.json({ error: "Unknown client" }, { status: 404 });
  }

  const payload: InboundWebhookPayload = {
    fromEmail: String(body.fromEmail ?? ""),
    toEmail: body.toEmail != null ? String(body.toEmail) : undefined,
    subject: body.subject != null ? String(body.subject) : undefined,
    snippet: body.snippet != null ? String(body.snippet) : undefined,
    bodyPreview:
      body.bodyPreview != null ? String(body.bodyPreview) : undefined,
    providerMessageId:
      body.providerMessageId != null
        ? String(body.providerMessageId)
        : undefined,
    inReplyToProviderId:
      body.inReplyToProviderId != null
        ? String(body.inReplyToProviderId)
        : undefined,
    receivedAt:
      body.receivedAt != null ? String(body.receivedAt) : undefined,
  };

  if (!payload.fromEmail) {
    return NextResponse.json({ error: "fromEmail required" }, { status: 400 });
  }

  try {
    const result = await ingestInboundForClient({
      clientId,
      payload,
      ingestionSource: "dev_simulate",
    });
    return NextResponse.json({
      ok: true,
      id: result.id,
      matchMethod: result.matchMethod,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ingest failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
