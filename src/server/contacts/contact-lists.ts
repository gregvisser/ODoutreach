import "server-only";

import { prisma } from "@/lib/db";

import {
  assertContactListClientScope,
  normalizeContactListName,
  resolveImportListTarget,
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
    where: { clientId },
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
  const list = await prisma.contactList.findUnique({
    where: { id: target.listId },
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

  const list = await prisma.contactList.findUnique({
    where: { id: contactListId },
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

  const result = await prisma.contactListMember.createMany({
    data: contacts.map((c) => ({
      contactListId,
      contactId: c.id,
      clientId,
      addedByStaffUserId: addedByStaffUserId ?? null,
    })),
    skipDuplicates: true,
  });

  return {
    added: result.count,
    skipped: uniqueIds.length - result.count,
  };
}
