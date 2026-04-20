import "server-only";

import { prisma } from "@/lib/db";

import {
  buildClientListsOverview,
  type ClientListsOverview,
  type RawListForView,
  type RawListMemberForView,
} from "./contact-lists-view-model";

/**
 * PR D3 — load the "Email lists for this client" view-model.
 *
 * Queries are scoped by `clientId` on both sides of the join:
 *   - `ContactList.clientId = clientId` (client-scoped lists only; global
 *     lists are out of scope in the bridge phase, per
 *     docs/ops/UNIVERSAL_CONTACTS_AND_LISTS_PLAN.md §5).
 *   - `ContactListMember.clientId = clientId` (redundant with the list
 *     scope but defends against any drift from the DB trigger).
 *
 * Two queries total regardless of list count: one for the list rows and
 * one for all members for this client. All rollups are done in the pure
 * builder in `contact-lists-view-model.ts`.
 */
export async function loadClientListsOverview(
  clientId: string,
): Promise<ClientListsOverview> {
  if (!clientId) {
    return {
      lists: [],
      totals: {
        totalLists: 0,
        uniqueContacts: {
          total: 0,
          valid: 0,
          emailSendable: 0,
          suppressed: 0,
          missingEmail: 0,
          missingOutreachIdentifier: 0,
        },
      },
    };
  }

  const listRows = await prisma.contactList.findMany({
    where: { clientId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      clientId: true,
      createdAt: true,
      updatedAt: true,
      createdBy: { select: { displayName: true, email: true } },
    },
    take: 50,
  });

  const lists: RawListForView[] = listRows.map((l) => ({
    id: l.id,
    name: l.name,
    description: l.description,
    clientId: l.clientId,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
    createdByName: l.createdBy?.displayName ?? l.createdBy?.email ?? null,
  }));

  if (lists.length === 0) {
    return buildClientListsOverview({ lists: [], members: [] });
  }

  const listIds = lists.map((l) => l.id);
  const memberRows = await prisma.contactListMember.findMany({
    where: { clientId, contactListId: { in: listIds } },
    orderBy: { addedAt: "desc" },
    select: {
      id: true,
      contactListId: true,
      addedAt: true,
      contact: {
        select: {
          id: true,
          email: true,
          fullName: true,
          firstName: true,
          lastName: true,
          company: true,
          linkedIn: true,
          mobilePhone: true,
          officePhone: true,
          isSuppressed: true,
        },
      },
    },
    // Safety cap — the page would degrade well before this, and the
    // view-model is resilient to missing members (readiness still works
    // against whatever subset it receives).
    take: 5000,
  });

  const members: RawListMemberForView[] = memberRows.map((m) => ({
    id: m.id,
    contactListId: m.contactListId,
    addedAt: m.addedAt,
    contact: {
      id: m.contact.id,
      email: m.contact.email,
      fullName: m.contact.fullName,
      firstName: m.contact.firstName,
      lastName: m.contact.lastName,
      company: m.contact.company,
      linkedIn: m.contact.linkedIn,
      mobilePhone: m.contact.mobilePhone,
      officePhone: m.contact.officePhone,
      isSuppressed: m.contact.isSuppressed,
    },
  }));

  return buildClientListsOverview({ lists, members });
}
