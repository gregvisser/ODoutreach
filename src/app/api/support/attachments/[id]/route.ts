import { type NextRequest } from "next/server";

import { prisma } from "@/lib/db";
import { tryGetOpensDoorsStaff } from "@/server/auth/staff";

export const dynamic = "force-dynamic";

/** Serves a support-ticket screenshot to signed-in staff only. */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const staff = await tryGetOpensDoorsStaff();
  if (!staff) {
    return new Response("Forbidden", { status: 403 });
  }
  const { id } = await context.params;
  const att = await prisma.supportTicketAttachment.findUnique({
    where: { id },
    select: { data: true, mimeType: true, fileName: true },
  });
  if (!att) {
    return new Response("Not found", { status: 404 });
  }
  const bytes = att.data as unknown as Buffer;
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": att.mimeType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${att.fileName.replace(/["\r\n]/g, "")}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
