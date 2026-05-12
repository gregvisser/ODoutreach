import "server-only";

import { extractDomainFromEmail } from "@/lib/normalize";
import { prisma } from "@/lib/db";
import {
  attachContactsToClientList,
  findOrCreateClientContactListByName,
} from "@/server/contacts/contact-lists";
import { refreshContactSuppressionFlagsForClient } from "@/server/outreach/suppression-guard";

export type CreateListFromUniverseResult = {
  listId: string;
  listName: string;
  selected: number;
  addedToList: number;
  listSkippedDuplicates: number;
  materializedNewContacts: number;
  reusedExistingContacts: number;
  skippedNoEmail: number;
};

/**
 * Materialize client-scoped `Contact` rows from global Universe picks and attach
 * them to a new or existing client list (by normalized name).
 */
export async function createClientContactListFromUniverseContacts(args: {
  clientId: string;
  listName: string;
  universeContactIds: string[];
  addedByStaffUserId: string;
}): Promise<CreateListFromUniverseResult> {
  const { clientId, listName, universeContactIds, addedByStaffUserId } = args;
  const uniqueUniverseIds = Array.from(new Set(universeContactIds.filter(Boolean)));
  const list = await findOrCreateClientContactListByName({
    clientId,
    name: listName,
    createdByStaffUserId: addedByStaffUserId,
  });

  let materializedNewContacts = 0;
  let reusedExistingContacts = 0;
  let skippedNoEmail = 0;
  const contactIds: string[] = [];

  for (const uid of uniqueUniverseIds) {
    const u = await prisma.contactUniverse.findUnique({
      where: { id: uid },
    });
    if (!u) continue;
    const email = u.emailNormalized?.trim().toLowerCase();
    if (!email) {
      skippedNoEmail++;
      continue;
    }

    const existing = await prisma.contact.findUnique({
      where: { clientId_email: { clientId, email } },
    });

    if (existing) {
      reusedExistingContacts++;
      if (!existing.universeContactId) {
        await prisma.contact.update({
          where: { id: existing.id },
          data: { universeContactId: u.id },
        });
      }
      contactIds.push(existing.id);
      continue;
    }

    const created = await prisma.contact.create({
      data: {
        clientId,
        email,
        emailDomain: extractDomainFromEmail(email) || null,
        fullName: u.fullName,
        firstName: u.firstName,
        lastName: u.lastName,
        company: u.companyName,
        title: u.jobTitle,
        location: u.location,
        city: u.city,
        country: u.country,
        industry: u.industry,
        source: "MANUAL",
        universeContactId: u.id,
      },
    });
    materializedNewContacts++;
    contactIds.push(created.id);
  }

  const attach = await attachContactsToClientList({
    clientId,
    contactListId: list.id,
    contactIds,
    addedByStaffUserId,
  });

  await prisma.contactList.update({
    where: { id: list.id },
    data: { updatedAt: new Date() },
  });

  await refreshContactSuppressionFlagsForClient(clientId);

  return {
    listId: list.id,
    listName: list.name,
    selected: uniqueUniverseIds.length,
    addedToList: attach.added,
    listSkippedDuplicates: attach.skipped,
    materializedNewContacts,
    reusedExistingContacts,
    skippedNoEmail,
  };
}
