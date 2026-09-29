import "server-only";

import { prisma } from "@/lib/db";
import { normalizeLinkedInUrl } from "@/lib/universe/normalize-identifiers";
import {
  emptyKnownProfileIndexes,
  type KnownProfileIndexes,
  type RocketReachSearchIdentity,
  type UniverseReuseFields,
} from "@/lib/clients/rocketreach-known-match";

const universeSelect = {
  id: true,
  emailNormalized: true,
  linkedinUrlNormalized: true,
  firstName: true,
  lastName: true,
  fullName: true,
  companyName: true,
  jobTitle: true,
  location: true,
  city: true,
  country: true,
  industry: true,
} as const;

type UniverseRow = {
  id: string;
  emailNormalized: string | null;
  linkedinUrlNormalized: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  companyName: string | null;
  jobTitle: string | null;
  location: string | null;
  city: string | null;
  country: string | null;
  industry: string | null;
};

function toReuse(row: UniverseRow): UniverseReuseFields {
  return {
    universeId: row.id,
    email: row.emailNormalized ?? "",
    firstName: row.firstName,
    lastName: row.lastName,
    fullName: row.fullName,
    companyName: row.companyName,
    jobTitle: row.jobTitle,
    linkedinUrl: row.linkedinUrlNormalized,
    location: row.location,
    city: row.city,
    country: row.country,
    industry: row.industry,
  };
}

export async function loadKnownRocketReachIndexes(
  clientId: string,
  profiles: RocketReachSearchIdentity[],
): Promise<KnownProfileIndexes> {
  const indexes = emptyKnownProfileIndexes();
  if (profiles.length === 0) return indexes;
  const profileIds = profiles.map((profile) => String(profile.id));
  const emails = [...new Set(profiles.flatMap((profile) => profile.emails))];
  const linkedins = [
    ...new Set(
      profiles
        .map((profile) => profile.linkedinNormalized)
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  const [enrichments, sources, universesByEmail, universesByLinkedIn] = await Promise.all([
    prisma.rocketReachEnrichment.findMany({
      where: { clientId, externalId: { in: profileIds }, contactId: { not: null } },
      select: { externalId: true, contactId: true },
    }),
    prisma.contactUniverseSource.findMany({
      where: { rocketReachPersonId: { in: profileIds } },
      select: { rocketReachPersonId: true, universe: { select: universeSelect } },
    }),
    emails.length
      ? prisma.contactUniverse.findMany({
          where: { emailNormalized: { in: emails } },
          select: universeSelect,
        })
      : Promise.resolve([]),
    linkedins.length
      ? prisma.contactUniverse.findMany({
          where: { linkedinUrlNormalized: { in: linkedins } },
          select: universeSelect,
        })
      : Promise.resolve([]),
  ]);

  const universeById = new Map<string, UniverseRow>();
  for (const source of sources) {
    if (!source.rocketReachPersonId) continue;
    universeById.set(source.universe.id, source.universe);
    if (!indexes.universeByProfileId.has(source.rocketReachPersonId)) {
      indexes.universeByProfileId.set(source.rocketReachPersonId, toReuse(source.universe));
    }
  }
  for (const row of [...universesByEmail, ...universesByLinkedIn]) {
    universeById.set(row.id, row);
    if (row.emailNormalized) {
      indexes.universeByEmail.set(row.emailNormalized, toReuse(row));
    }
    if (row.linkedinUrlNormalized) {
      indexes.universeByLinkedIn.set(row.linkedinUrlNormalized, toReuse(row));
    }
  }

  const universeIds = [...universeById.keys()];
  const or: Array<Record<string, unknown>> = [];
  if (emails.length) or.push({ email: { in: emails } });
  if (universeIds.length) or.push({ universeContactId: { in: universeIds } });
  const contacts = or.length
    ? await prisma.contact.findMany({
        where: { clientId, OR: or },
        select: { id: true, email: true, linkedIn: true, universeContactId: true },
      })
    : [];

  const contactByUniverse = new Map<string, string>();
  for (const contact of contacts) {
    if (contact.email) {
      indexes.clientContactIdByEmail.set(contact.email, contact.id);
    }
    const linkedin = normalizeLinkedInUrl(contact.linkedIn);
    if (linkedin) {
      indexes.clientContactIdByLinkedIn.set(linkedin, contact.id);
    }
    if (contact.universeContactId) contactByUniverse.set(contact.universeContactId, contact.id);
  }
  for (const enrichment of enrichments) {
    if (enrichment.externalId && enrichment.contactId) {
      indexes.clientContactIdByProfileId.set(enrichment.externalId, enrichment.contactId);
    }
  }
  for (const [profileId, fields] of indexes.universeByProfileId) {
    const contactId = contactByUniverse.get(fields.universeId);
    if (contactId) indexes.clientContactIdByProfileId.set(profileId, contactId);
  }
  return indexes;
}
