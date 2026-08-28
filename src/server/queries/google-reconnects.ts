import "server-only";

import {
  buildGoogleReconnectRoster,
  type GoogleReconnectRoster,
  type GoogleReconnectRosterInput,
} from "@/lib/mailboxes/google-reconnect-roster";
import { prisma } from "@/lib/db";

/**
 * Every Google mailbox across every live client workspace, ready for the
 * all-clients reconnect screen.
 *
 * Tenant wall: the caller passes the ids from `getAccessibleClientIds`, which
 * already excludes soft-deleted workspaces. This adds the two mailbox-level
 * filters that decide whether a row is still somebody's problem — a mailbox
 * taken out of the workspace pool, or switched off by an operator, is not part
 * of the weekly chore and must not inflate the count.
 *
 * `provider: GOOGLE` is filtered in SQL rather than in the roster so a large
 * Microsoft estate is never dragged into memory to be discarded; the roster
 * filters again, which is free and keeps it honest against its own fixtures.
 */
export async function getGoogleReconnectRoster(
  accessibleClientIds: string[],
  now: Date = new Date(),
): Promise<GoogleReconnectRoster> {
  if (accessibleClientIds.length === 0) {
    return buildGoogleReconnectRoster([], now);
  }

  const rows = await prisma.clientMailboxIdentity.findMany({
    where: {
      clientId: { in: accessibleClientIds },
      provider: "GOOGLE",
      isActive: true,
      workspaceRemovedAt: null,
    },
    select: {
      id: true,
      clientId: true,
      email: true,
      provider: true,
      connectionStatus: true,
      connectedAt: true,
      client: { select: { name: true, slug: true } },
    },
  });

  const inputs: GoogleReconnectRosterInput[] = rows.map((row) => ({
    mailboxId: row.id,
    clientId: row.clientId,
    clientName: row.client.name,
    clientSlug: row.client.slug,
    provider: row.provider,
    connectionStatus: row.connectionStatus,
    connectedAt: row.connectedAt,
    email: row.email,
  }));

  return buildGoogleReconnectRoster(inputs, now);
}
