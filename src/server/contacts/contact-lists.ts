import "server-only";

import { prisma } from "@/lib/db";
import { chunk } from "@/lib/db-bulk";

import {
  assertContactListClientScope,
  normalizeContactListName,
} from "./contact-lists-policy";
import type {
  ImportListTarget,
  ImportListTargetInput,
} from "./contact-lists-policy";

/**
 * PR D2 — DB-facing helpers for `ContactList` / `ContactListMember`.
 *
 * Rules (per docs/ops/UNIVERSAL_CONTACTS_AND_LISTS_PLAN.md):
 * - Imports inside a client workspace always create/select a **client-scoped**
 *   list (`ContactList.clientId` = current client).
 * - Dedupe by normalized list name within a client (case-insensitive, trimmed).
 * - Membership writes are idempotent per `(contactListId, contactId)`.
 * - App-level scope check runs before the DB trigger
 *   `ContactListMember_client_scope_guard` so we get clear 4xx-style errors
 *   instead of a raw SQL exception.
 */

export {
  assertContactListClientScope,
  normalizeContactListName,
  resolveImportListTarget,
} from "./contact-lists-policy";
export type { ImportListTarget, ImportListTargetInput };

export type ContactListSummary = {
  id: string;
  name: string;
  clientId: string | null;
  memberCount: number;
  updatedAt: Date;
};

/** Lists the current client's lists (most-recently-updated first). */
export async function listContactListsForClient(
  clientId: string,
): Promise<ContactListSummary[]> {
  if (!clientId) return [];
  const rows = await prisma.contactList.findMany({
    where: { clientId, archivedAt: null },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      clientId: true,
      updatedAt: true,
      _count: { select: { members: true } },
    },
    take: 50,
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    clientId: r.clientId,
    memberCount: r._count.members,
    updatedAt: r.updatedAt,
  }));
}

/**
 * The same thing for MANY clients, in one round-trip.
 *
 * Queue item 27, defect (9): /contacts preloaded the list picker by calling
 * `listContactListsForClient` inside `clients.map(...)`. That is one query per
 * workspace — seventeen on production — every time the page opened, purely so a
 * dropdown could be populated before anyone had chosen a workspace. Same rows,
 * one query.
 *
 * Per-client `take: 50` is preserved by trimming after the fetch rather than in
 * SQL: a `LIMIT` here would apply to the whole result set, not to each client,
 * which would silently drop workspaces off the end of the picker.
 */
export async function listContactListsForClients(
  clientIds: string[],
): Promise<Record<string, ContactListSummary[]>> {
  const byClient: Record<string, ContactListSummary[]> = {};
  for (const id of clientIds) {
    byClient[id] = [];
  }
  if (clientIds.length === 0) return byClient;

  const rows = await prisma.contactList.findMany({
    where: { clientId: { in: clientIds }, archivedAt: null },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      clientId: true,
      updatedAt: true,
      _count: { select: { members: true } },
    },
  });

  for (const r of rows) {
    // `clientId` is nullable on the model; the filter above means every row
    // here has one, but narrow rather than assert.
    const key = r.clientId;
    if (!key) continue;
    const bucket = byClient[key];
    if (!bucket || bucket.length >= 50) continue;
    bucket.push({
      id: r.id,
      name: r.name,
      clientId: r.clientId,
      memberCount: r._count.members,
      updatedAt: r.updatedAt,
    });
  }
  return byClient;
}

/**
 * Find-or-create a client-scoped list by normalized name. Returns the list row.
 * Name matches are case-insensitive + trimmed; stored casing is whatever the
 * operator typed the first time.
 */
export async function findOrCreateClientContactListByName(args: {
  clientId: string;
  name: string;
  createdByStaffUserId?: string | null;
}): Promise<{ id: string; name: string; clientId: string | null }> {
  const { clientId, createdByStaffUserId } = args;
  const normalized = normalizeContactListName(args.name);
  if (!normalized) {
    throw new Error("CONTACT_LIST_NAME_REQUIRED");
  }
  if (normalized.length > 120) {
    throw new Error("CONTACT_LIST_NAME_TOO_LONG");
  }

  const existing = await prisma.contactList.findFirst({
    where: {
      clientId,
      archivedAt: null,
      name: { equals: normalized, mode: "insensitive" },
    },
    select: { id: true, name: true, clientId: true },
  });
  if (existing) return existing;

  const created = await prisma.contactList.create({
    data: {
      name: normalized,
      clientId,
      createdByStaffUserId: createdByStaffUserId ?? null,
    },
    select: { id: true, name: true, clientId: true },
  });
  return created;
}

/**
 * Resolves the operator's import target to a concrete `ContactList` row,
 * performing tenant-isolation checks: an `existingListId` must belong to the
 * caller's client (client-scoped list) and must exist.
 */
export async function resolveImportListForClient(args: {
  clientId: string;
  target: ImportListTarget;
  createdByStaffUserId?: string | null;
}): Promise<{ id: string; name: string; clientId: string | null }> {
  const { clientId, target, createdByStaffUserId } = args;
  if (target.kind === "new") {
    return findOrCreateClientContactListByName({
      clientId,
      name: target.listName,
      createdByStaffUserId: createdByStaffUserId ?? null,
    });
  }
  const list = await prisma.contactList.findFirst({
    where: { id: target.listId, archivedAt: null },
    select: { id: true, name: true, clientId: true },
  });
  if (!list) {
    throw new Error("CONTACT_LIST_NOT_FOUND");
  }
  if (list.clientId !== clientId) {
    // Bridge phase: imports may only write to lists owned by the current
    // client. Global lists (clientId = null) are visible via
    // `listContactListsForClient` but are not selectable at import time yet.
    throw new Error("CONTACT_LIST_WRONG_CLIENT");
  }
  return list;
}

/**
 * Idempotently adds `contactIds` to `contactListId` for the given client.
 * Returns the count of *new* members actually inserted. Existing members are
 * not touched (SQL `skipDuplicates`).
 *
 * Must be called with contacts already verified to belong to `clientId` —
 * this helper asserts it in application code before the DB trigger fires.
 */
export async function attachContactsToClientList(args: {
  clientId: string;
  contactListId: string;
  contactIds: string[];
  addedByStaffUserId?: string | null;
}): Promise<{ added: number; skipped: number }> {
  const { clientId, contactListId, contactIds, addedByStaffUserId } = args;
  if (contactIds.length === 0) return { added: 0, skipped: 0 };

  const uniqueIds = Array.from(new Set(contactIds));

  const list = await prisma.contactList.findFirst({
    where: { id: contactListId, archivedAt: null },
    select: { id: true, clientId: true },
  });
  if (!list) throw new Error("CONTACT_LIST_NOT_FOUND");

  const contacts = await prisma.contact.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, clientId: true },
  });
  if (contacts.length !== uniqueIds.length) {
    throw new Error("CONTACT_NOT_FOUND");
  }

  assertContactListClientScope({
    list,
    contacts,
    requiredClientId: clientId,
  });

  // Insert in chunks so a large list upload never becomes one oversized
  // INSERT statement.
  let added = 0;
  for (const batch of chunk(
    contacts.map((c) => ({
      contactListId,
      contactId: c.id,
      clientId,
      addedByStaffUserId: addedByStaffUserId ?? null,
    })),
  )) {
    const result = await prisma.contactListMember.createMany({
      data: batch,
      skipDuplicates: true,
    });
    added += result.count;
  }

  return {
    added,
    skipped: uniqueIds.length - added,
  };
}

/**
 * Deletes a client-scoped list when it is not referenced by sequences or
 * send history; otherwise soft-archives it so FK rows stay valid. Never
 * deletes Universe contacts.
 */
export async function deleteOrArchiveClientContactList(args: {
  clientId: string;
  listId: string;
}): Promise<
  | { ok: true; mode: "deleted" }
  | { ok: true; mode: "archived"; message: string }
  | { ok: false; error: string }
> {
  const { clientId, listId } = args;
  const list = await prisma.contactList.findFirst({
    where: { id: listId, clientId },
    select: { id: true, archivedAt: true },
  });
  if (!list) {
    return { ok: false, error: "List not found." };
  }
  if (list.archivedAt) {
    return { ok: false, error: "This list is already archived." };
  }

  const [sequences, enrollments, stepSends] = await Promise.all([
    prisma.clientEmailSequence.count({ where: { contactListId: listId } }),
    prisma.clientEmailSequenceEnrollment.count({ where: { contactListId: listId } }),
    prisma.clientEmailSequenceStepSend.count({ where: { contactListId: listId } }),
  ]);

  if (sequences + enrollments + stepSends > 0) {
    await prisma.contactList.update({
      where: { id: listId },
      data: { archivedAt: new Date() },
    });
    return {
      ok: true,
      mode: "archived",
      message:
        "This list is used by outreach history, so it was archived instead of permanently deleted.",
    };
  }

  await prisma.contactList.delete({ where: { id: listId } });
  return { ok: true, mode: "deleted" };
}
