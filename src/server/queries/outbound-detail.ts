import "server-only";

import { prisma } from "@/lib/db";
export async function getOutboundEmailByIdForStaff(
  id: string,
  accessibleClientIds: string[],
) {
  const row = await prisma.outboundEmail.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true, slug: true } },
      contact: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          fullName: true,
        },
      },
      staffUser: { select: { email: true, displayName: true } },
      campaign: { select: { name: true } },
      providerEvents: {
        orderBy: { createdAt: "desc" },
        take: 15,
        select: {
          id: true,
          eventType: true,
          providerName: true,
          createdAt: true,
        },
      },
      inboundReplies: {
        orderBy: { receivedAt: "desc" },
        take: 20,
        select: {
          id: true,
          receivedAt: true,
          fromEmail: true,
          snippet: true,
          matchMethod: true,
          providerMessageId: true,
        },
      },
    },
  });

  if (!row) return null;
  if (!accessibleClientIds.includes(row.clientId)) return null;
  return row;
}
