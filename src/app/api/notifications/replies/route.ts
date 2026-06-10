import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { tryGetOpensDoorsStaff } from "@/server/auth/staff";
import { getAccessibleClientIds } from "@/server/tenant/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lightweight poll target for the in-app new-reply notifier.
 *
 * Returns the most recent LINKED reply across the signed-in staff
 * member's accessible clients (same visibility filter as the Activity
 * replies list: matchMethod != UNLINKED and a linked outbound). The
 * client component keeps a "last seen" watermark and pops a toast when
 * a newer reply appears.
 *
 * Session-authenticated — staff only, tenant-scoped. Never cached.
 */
export async function GET() {
  const staff = await tryGetOpensDoorsStaff();
  if (!staff) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessible = await getAccessibleClientIds(staff);
  if (accessible.length === 0) {
    return NextResponse.json({ latest: null });
  }

  const latest = await prisma.inboundReply.findFirst({
    where: {
      clientId: { in: accessible },
      matchMethod: { not: "UNLINKED" },
      linkedOutboundEmailId: { not: null },
    },
    orderBy: { receivedAt: "desc" },
    select: {
      id: true,
      receivedAt: true,
      fromEmail: true,
      subject: true,
      clientId: true,
      client: { select: { name: true } },
    },
  });

  return NextResponse.json({
    latest: latest
      ? {
          id: latest.id,
          receivedAtIso: latest.receivedAt.toISOString(),
          fromEmail: latest.fromEmail,
          subject: latest.subject,
          clientId: latest.clientId,
          clientName: latest.client.name,
        }
      : null,
  });
}
