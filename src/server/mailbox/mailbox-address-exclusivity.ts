import "server-only";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

/**
 * The client OR a transaction handle. The restore path has to run its check
 * inside the same transaction that performs the restore, so both are accepted.
 */
type MailboxDb = PrismaClient | Prisma.TransactionClient;

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
 * situation where it already exists.
 */

/** The subset of a mailbox row this module reasons about. */
export type LiveMailboxRow = {
  id: string;
  clientId: string;
  emailNormalized: string;
  /**
   * `connectedAt ?? createdAt`. Used only as the ownership tie-break below —
   * the workspace that had the address FIRST keeps it.
   */
  since: Date;
};

export type SharedMailboxAddress = {
  emailNormalized: string;
  /** The mailbox row whose workspace may persist raw inbound mail. */
  ownerMailboxId: string;
  ownerClientId: string;
  /** Every live row for this address, oldest first. */
  rows: LiveMailboxRow[];
};

/**
 * Deterministic ownership: oldest `since` wins, and where two rows share a
 * timestamp the lower id wins so the answer never depends on row order.
 *
 * Determinism is the point. If this flipped between syncs, both workspaces
 * would take turns writing the raw store and the leak would continue at half
 * the rate while every individual sync looked correct.
 */
export function resolveRawStoreOwner(rows: readonly LiveMailboxRow[]): LiveMailboxRow | null {
  let owner: LiveMailboxRow | null = null;
  for (const row of rows) {
    if (!owner) {
      owner = row;
      continue;
    }
    const older = row.since.getTime() - owner.since.getTime();
    if (older < 0 || (older === 0 && row.id < owner.id)) {
      owner = row;
    }
  }
  return owner;
}

/**
 * Groups live mailbox rows by address and returns only those addresses that
 * are attached to more than one workspace. Pure — the ops probe runs it over
 * production rows and the tests run it over fixtures.
 */
export function findSharedMailboxAddresses(
  rows: readonly LiveMailboxRow[],
): SharedMailboxAddress[] {
  const byAddress = new Map<string, LiveMailboxRow[]>();
  for (const row of rows) {
    const existing = byAddress.get(row.emailNormalized);
    if (existing) existing.push(row);
    else byAddress.set(row.emailNormalized, [row]);
  }

  const shared: SharedMailboxAddress[] = [];
  for (const [emailNormalized, addressRows] of byAddress) {
    const clientIds = new Set(addressRows.map((r) => r.clientId));
    if (clientIds.size < 2) continue;
    const owner = resolveRawStoreOwner(addressRows);
    if (!owner) continue;
    shared.push({
      emailNormalized,
      ownerMailboxId: owner.id,
      ownerClientId: owner.clientId,
      rows: [...addressRows].sort(
        (a, b) => a.since.getTime() - b.since.getTime() || (a.id < b.id ? -1 : 1),
      ),
    });
  }
  return shared.sort((a, b) => (a.emailNormalized < b.emailNormalized ? -1 : 1));
}

/** A live mailbox row for this address on a DIFFERENT, live workspace. */
export type MailboxAddressConflict = {
  mailboxId: string;
  clientId: string;
  clientName: string;
};

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

/**
 * The refusal a staff member reads. It names the other workspace, because
 * "already in use" with no name sends someone hunting through seventeen of
 * them, and it says what to do instead rather than only what was blocked.
 */
export function mailboxAddressConflictMessage(
  emailNormalized: string,
  conflicts: readonly MailboxAddressConflict[],
): string {
  const names = conflicts.map((c) => c.clientName).join(", ");
  return (
    `${emailNormalized} is already connected to ${names}. ` +
    "One mailbox can only belong to one workspace — connecting it to a second " +
    "would copy every message in that inbox, replies included, into both. " +
    "Remove it from the other workspace first, or use a different address."
  );
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
 * This half exists because the create-time refusal below cannot help a pair
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
