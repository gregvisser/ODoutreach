import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { fetchClientLogoBytes } from "@/server/branding/fetch-client-logo";
import { requireClientAccess } from "@/server/tenant/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  clientId: z.string().trim().min(1).max(128),
});

const AUTH_FAILURES = new Set([
  "Unauthorized",
  "STAFF_INACTIVE",
  "STAFF_EMAIL_NOT_ALLOWED",
  "FORBIDDEN_CLIENT",
]);

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

/**
 * Serves a client's saved logo from our origin.
 *
 * The browser asks us, and we ask the host the URL points at, with no
 * Referer. Sites that 403 a hotlinked image still answer that request.
 * A failure is a 404 so the logo tile can fall back to initials.
 */
export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const parsed = paramsSchema.safeParse(await context.params);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const staff = await requireOpensDoorsStaff();
    await requireClientAccess(staff, parsed.data.clientId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (AUTH_FAILURES.has(message)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    logger.error(
      { err, scope: "client-logo", clientId: parsed.data.clientId },
      "Could not authorise a client logo read",
    );
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }

  const client = await prisma.client.findFirst({
    where: { id: parsed.data.clientId, deletedAt: null },
    select: { logoUrl: true },
  });
  const logoUrl = client?.logoUrl?.trim() ?? "";
  if (!logoUrl) {
    return new NextResponse(null, { status: 404 });
  }

  const logo = await fetchClientLogoBytes(logoUrl);
  if (!logo) {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(Buffer.from(logo.body), {
    status: 200,
    headers: {
      "content-type": logo.contentType,
      "cache-control": "private, max-age=300",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
