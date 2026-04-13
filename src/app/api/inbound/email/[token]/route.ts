import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import {
  ingestInboundForClient,
  type InboundWebhookPayload,
} from "@/server/email/inbound/ingest";

export const runtime = "nodejs";

/**
 * ESP webhook target: POST /api/inbound/email/{inboundIngestToken}
 * Optional: Authorization: Bearer {INBOUND_WEBHOOK_SECRET}
 *
 * Body JSON: { fromEmail, toEmail?, subject?, snippet?, bodyPreview?, providerMessageId?, inReplyToProviderId?, receivedAt? }
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;

  const secret = process.env.INBOUND_WEBHOOK_SECRET?.trim();
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const client = await prisma.client.findUnique({
    where: { inboundIngestToken: token },
    select: { id: true },
  });

  if (!client) {
    return NextResponse.json({ error: "Unknown token" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const p = body as Partial<InboundWebhookPayload>;
  if (!p.fromEmail || typeof p.fromEmail !== "string") {
    return NextResponse.json({ error: "fromEmail required" }, { status: 400 });
  }

  try {
    const result = await ingestInboundForClient({
      clientId: client.id,
      payload: {
        fromEmail: p.fromEmail,
        toEmail: p.toEmail,
        subject: p.subject,
        snippet: p.snippet,
        bodyPreview: p.bodyPreview,
        providerMessageId: p.providerMessageId,
        inReplyToProviderId: p.inReplyToProviderId,
        receivedAt: p.receivedAt,
      },
      ingestionSource: "webhook",
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
