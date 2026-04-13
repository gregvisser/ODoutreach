import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";

import { applyNormalizedEmailEvent } from "@/server/email/webhooks/outbound-provider-events";

export const runtime = "nodejs";

/**
 * Resend → Svix-signed webhooks. Configure URL in Resend dashboard; set RESEND_WEBHOOK_SECRET.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const rawBody = await req.text();
  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing Svix headers" }, { status: 400 });
  }

  let parsed: {
    type?: string;
    created_at?: string;
    data?: Record<string, unknown>;
  };

  try {
    const wh = new Webhook(secret);
    const payload = wh.verify(rawBody, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    });
    parsed = typeof payload === "string" ? JSON.parse(payload) : (payload as typeof parsed);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const type = parsed.type ?? "unknown";
  const data = parsed.data ?? {};
  const emailId =
    typeof data.email_id === "string"
      ? data.email_id
      : typeof data.id === "string"
        ? data.id
        : null;

  if (!emailId) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const bounce =
    data.bounce && typeof data.bounce === "object"
      ? (data.bounce as { type?: string; message?: string })
      : null;

  await applyNormalizedEmailEvent({
    providerName: "resend",
    providerMessageId: emailId,
    eventType: type,
    createdAt: parsed.created_at ? new Date(parsed.created_at) : new Date(),
    bounceCategory: bounce?.type ?? bounce?.message ?? null,
    providerStatus: type,
    rawPayload: parsed,
    webhookMessageId: svixId,
  });

  return NextResponse.json({ ok: true });
}
