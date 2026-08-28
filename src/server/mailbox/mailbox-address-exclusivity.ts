import "server-only";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  resolveRawStoreOwner,
  type LiveMailboxRow,
  type MailboxAddressConflict,
} from "@/lib/mailbox/address-exclusivity";

/**
 * E-06 — one mailbox address connected to two workspaces.
 *
 * `ClientMailboxIdentity` is unique on `@@unique([clientId, emailNormalized])`,
 * which is per client. Nothing stopped the SAME address being attached to a
 * second workspace, and when that happened both workspaces synced the same
 * physical inbox and each stored its own copy of every raw message —
 * `InboundMailboxMessage`, full `bodyText` included. One client's workspace
 * ended up holding another client's prospects' replies verbatim.
 *
 * Recorded as E-06 in specs/BC-01-tenant-isolation.md on 2026-08-23 and left
 * open, because the fix looked like it needed a schema change. It does not.
 *
 * What DOES already hold, verified before writing this (do not "fix" it again):
 *
 *  - Replies do not cross. `processSyncedMessageForReply` will not create an
 *    `InboundReply` without a matching outbound in that same client.
 *  - Bounces do not cross. `processSyncedMessageForBounce` opens with an
 *    `outboundEmail.findFirst` scoped to `clientId` and returns
 *    `{ suppressed: false }` when there is no match, so a workspace cannot
 *    learn about an address it never mailed.
 *
 * So the leak is exactly one table: the raw store. This module is the two
 * halves of closing it — refuse to create the situation, and contain the
 * situation where it already exists. The ownership RULE those halves share is
 * pure and lives in `@/lib/mailbox/address-exclusivity`, so the ops probe can
 * run it outside Next.
 */

/**
 * The client OR a transaction handle. The restore path has to run its check
 * inside the same transaction that performs the restore, so both are accepted.
 */
type MailboxDb = PrismaClient | Prisma.TransactionClient;

export {
  findSharedMailboxAddresses,
  mailboxAddressConflictMessage,
  resolveRawStoreOwner,
  type LiveMailboxRow,
  type MailboxAddressConflict,
  type SharedMailboxAddress,
} from "@/lib/mailbox/address-exclusivity";

/**
 * A row counts as a conflict when it is still in a workspace
 * (`workspaceRemovedAt: null`) on a workspace that has not been soft-deleted.
 *
 * Connection status is deliberately NOT part of the test. A DRAFT row is one
 * OAuth click away from syncing, so refusing only CONNECTED ones would let the
 * conflict be created and then completed.
 */
export async function findMailboxAddressConflicts(input: {
  emailNormalized: string;
  clientId: string;
  excludeMailboxId?: string;
  db?: MailboxDb;
}): Promise<MailboxAddressConflict[]> {
  const db = input.db ?? prisma;
  const rows = await db.clientMailboxIdentity.findMany({
    where: {
      emailNormalized: input.emailNormalized,
      clientId: { not: input.clientId },
      workspaceRemovedAt: null,
      client: { deletedAt: null },
      ...(input.excludeMailboxId ? { id: { not: input.excludeMailboxId } } : {}),
    },
    select: { id: true, clientId: true, client: { select: { name: true } } },
  });
  return rows.map((r) => ({
    mailboxId: r.id,
    clientId: r.clientId,
    clientName: r.client.name,
  }));
}

export type RawInboundStoreDecision =
  | { allowed: true }
  | { allowed: false; ownerClientId: string; sharedWithClientIds: string[] };

/**
 * Runtime gate, called ONCE per inbox sync rather than per message.
 *
 * When an address is live on more than one workspace, only the workspace that
 * had it first persists raw inbound mail. The other still runs reply matching
 * and bounce detection — both are already scoped to their own client and were
 * verified so — it simply stops keeping a verbatim copy of an inbox that is
 * not its own.
 *
 * This half exists because the create-time refusal above cannot help a pair
 * that is already in the database.
 */
export async function mayPersistRawInboundMail(input: {
  mailboxIdentityId: string;
  emailNormalized: string;
  db?: MailboxDb;
}): Promise<RawInboundStoreDecision> {
  const db = input.db ?? prisma;
  const rows = await db.clientMailboxIdentity.findMany({
    where: {
      emailNormalized: input.emailNormalized,
      workspaceRemovedAt: null,
      client: { deletedAt: null },
    },
    select: {
      id: true,
      clientId: true,
      emailNormalized: true,
      connectedAt: true,
      createdAt: true,
    },
  });

  const live: LiveMailboxRow[] = rows.map((r) => ({
    id: r.id,
    clientId: r.clientId,
    emailNormalized: r.emailNormalized,
    since: r.connectedAt ?? r.createdAt,
  }));

  const clientIds = new Set(live.map((r) => r.clientId));
  if (clientIds.size < 2) return { allowed: true };

  const owner = resolveRawStoreOwner(live);
  if (owner && owner.id === input.mailboxIdentityId) return { allowed: true };

  return {
    allowed: false,
    ownerClientId: owner?.clientId ?? "",
    sharedWithClientIds: [...clientIds].sort(),
  };
}
