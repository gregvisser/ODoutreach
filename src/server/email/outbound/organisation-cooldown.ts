import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { organisationIdForClient } from "@/server/tenant/organisation-scope";

/**
 * Recent-send scope for the 10-day outreach cooldown.
 *
 * The window is organisation-wide, so OpensDoors clients still share it.
 * Another organisation's send is not in the scan. When the organisation
 * cannot be resolved, the scan is this client only.
 */
export function outreachCooldownClientWhere(
  organisationId: string | null,
  clientId: string | null,
): Prisma.OutboundEmailWhereInput {
  if (organisationId) return { client: { organisationId } };
  if (clientId) return { clientId };
  return { id: { in: [] } };
}

export async function findCooldownOutboundRows(input: {
  clientId: string;
  emails: string[];
  sentSince: Date;
}) {
  const organisationId = await organisationIdForClient(input.clientId);
  return prisma.outboundEmail.findMany({
    where: {
      toEmail: { in: input.emails, mode: "insensitive" },
      sentAt: { gte: input.sentSince, not: null },
      ...outreachCooldownClientWhere(organisationId, input.clientId),
    },
    select: {
      toEmail: true,
      id: true,
      clientId: true,
      sentAt: true,
      status: true,
      sequenceStepSends: { select: { sequenceId: true } },
    },
    orderBy: { sentAt: "desc" },
  });
}
