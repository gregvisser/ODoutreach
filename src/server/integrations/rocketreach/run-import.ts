import "server-only";

import { prisma } from "@/lib/db";
import { shouldDiscardNewImportList } from "@/lib/clients/rocketreach-empty-list";
import {
  findOrCreateClientContactListByName,
  resolveImportListForClient,
  resolveImportListTarget,
} from "@/server/contacts/contact-lists";
import {
  importRocketReachPeopleForClient,
  type RocketReachImportResult,
  type RocketReachLookupGovernor,
} from "./person-import";

export type RocketReachListImportResult =
  | (Omit<Extract<RocketReachImportResult, { ok: true }>, "contactListId"> & {
      contactListId: string;
      contactListName: string;
    })
  | { ok: false; error: string };

async function discardIfEmpty(listId: string): Promise<boolean> {
  const memberCount = await prisma.contactListMember.count({ where: { contactListId: listId } });
  if (!shouldDiscardNewImportList(true, memberCount)) return false;
  await prisma.contactList.delete({ where: { id: listId } });
  return true;
}

/**
 * Runs a RocketReach import into an existing list, or creates a new list only
 * once there is someone to add. A new list that stays empty is deleted.
 */
export async function runRocketReachListImport(args: {
  clientId: string;
  staffId: string | null;
  existingListId?: string;
  newListName?: string;
  searchBody: Record<string, unknown>;
  originNote?: string | null;
  sourceLabel?: string | null;
  governor?: RocketReachLookupGovernor;
  /** Automatic list top-up only. Manual imports stay at the manual cap. */
  maxBatch?: number;
}): Promise<RocketReachListImportResult> {
  const target = resolveImportListTarget({
    existingListId: args.existingListId,
    newListName: args.newListName,
  });
  if ("error" in target) return { ok: false, error: target.error };

  if (target.kind === "existing") {
    let list: { id: string; name: string };
    try {
      list = await resolveImportListForClient({
        clientId: args.clientId,
        target,
        createdByStaffUserId: args.staffId,
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : String(error);
      return { ok: false, error: listErrorMessage(code) };
    }
    const result = await importRocketReachPeopleForClient({
      clientId: args.clientId,
      searchBody: args.searchBody,
      contactListId: list.id,
      targetListName: list.name,
      addedByStaffUserId: args.staffId,
      originNote: args.originNote,
      sourceLabel: args.sourceLabel,
      governor: args.governor,
      maxBatch: args.maxBatch,
    });
    if (!result.ok) return result;
    return { ...result, contactListId: list.id, contactListName: list.name };
  }

  const existing = await prisma.contactList.findFirst({
    where: { clientId: args.clientId, archivedAt: null, name: { equals: target.listName, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (existing) {
    const result = await importRocketReachPeopleForClient({
      clientId: args.clientId,
      searchBody: args.searchBody,
      contactListId: existing.id,
      targetListName: existing.name,
      addedByStaffUserId: args.staffId,
      originNote: args.originNote,
      sourceLabel: args.sourceLabel,
      governor: args.governor,
      maxBatch: args.maxBatch,
    });
    if (!result.ok) return result;
    return { ...result, contactListId: existing.id, contactListName: existing.name };
  }

  let createdId: string | null = null;
  let createdName = target.listName;
  try {
    const result = await importRocketReachPeopleForClient({
      clientId: args.clientId,
      searchBody: args.searchBody,
      targetListName: target.listName,
      addedByStaffUserId: args.staffId,
      originNote: args.originNote,
      sourceLabel: args.sourceLabel,
      governor: args.governor,
      maxBatch: args.maxBatch,
      ensureContactList: async () => {
        const list = await findOrCreateClientContactListByName({
          clientId: args.clientId,
          name: target.listName,
          createdByStaffUserId: args.staffId,
        });
        createdId = list.id;
        createdName = list.name;
        return list;
      },
    });
    if (createdId && (await discardIfEmpty(createdId))) {
      if (!result.ok) return result;
      return {
        ok: false,
        error: "RocketReach returned nobody to add, so the new empty list was removed.",
      };
    }
    if (!result.ok) return result;
    if (!result.contactListId) {
      return { ok: false, error: "RocketReach returned nobody to add, so no new list was created." };
    }
    return { ...result, contactListName: createdName, contactListId: result.contactListId };
  } catch (error) {
    if (createdId) await discardIfEmpty(createdId).catch(() => false);
    const code = error instanceof Error ? error.message : String(error);
    return { ok: false, error: listErrorMessage(code) };
  }
}

function listErrorMessage(code: string): string {
  switch (code) {
    case "CONTACT_LIST_NOT_FOUND":
      return "Selected list no longer exists — choose another or type a new name.";
    case "CONTACT_LIST_WRONG_CLIENT":
      return "Selected list belongs to a different client workspace.";
    case "CONTACT_LIST_NAME_REQUIRED":
      return "Enter a list name before importing.";
    case "CONTACT_LIST_NAME_TOO_LONG":
      return "List name must be 120 characters or fewer.";
    default:
      return code.startsWith("RocketReach") || code.includes(" ") ? code : "Could not resolve the target list.";
  }
}
