import "server-only";

import { prisma } from "@/lib/db";
import { isInternalMail } from "@/lib/inbox/internal-mail";
import { resolveInternalDomainsForClient } from "@/server/inbox/internal-domains";

/**
 * Recent inbox messages for a client. F4 — internal staff mail (both ends on
 * a workspace domain) is filtered out so it never surfaces as a prospect
 * conversation. This is read-side only: historical rows already stored are
 * hidden, never deleted (Prime Directive). When the filter is disabled the
 * domain list is empty and nothing is filtered (legacy behaviour).
 */
export async function getRecentInboundMailboxMessagesForClient(
  clientId: string,
  take = 50,
) {
  const internalDomains = await resolveInternalDomainsForClient(clientId);
  const rows = await prisma.inboundMailboxMessage.findMany({
    where: { clientId },
    orderBy: { receivedAt: "desc" },
    // Over-fetch when filtering so a burst of internal noise doesn't starve
    // the list of genuine recent messages.
    take: internalDomains.length > 0 ? Math.min(take * 3, 200) : take,
    include: {
      mailbox: { select: { id: true, email: true, displayName: true } },
    },
  });
  if (internalDomains.length === 0) return rows.slice(0, take);
  return rows
    .filter(
      (m) =>
        !isInternalMail({
          fromEmail: m.fromEmail,
          toEmail: m.toEmail,
          internalDomains,
        }),
    )
    .slice(0, take);
}
