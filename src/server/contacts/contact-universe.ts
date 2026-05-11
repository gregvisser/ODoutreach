import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { UniverseSourceType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import {
  buildWeakMatchKey,
  normalizeLinkedInUrl,
  normalizePhoneDigits,
} from "@/lib/universe/normalize-identifiers";

export type DbClient = Prisma.TransactionClient | typeof prisma;

function preferText(existing: string | null | undefined, incoming: string | null | undefined) {
  const i = typeof incoming === "string" ? incoming.trim() : "";
  if (i) return i;
  const e = typeof existing === "string" ? existing.trim() : "";
  return e || null;
}

function appendSummary(existing: string | null | undefined, chunk: string) {
  const c = chunk.trim();
  if (!c) return existing ?? null;
  const e = (existing ?? "").trim();
  if (!e) return c;
  const next = `${e}; ${c}`;
  return next.length > 480 ? `${next.slice(0, 477)}…` : next;
}

export type UpsertUniverseInput = {
  emailNormalized?: string | null;
  linkedInRaw?: string | null;
  mobilePhoneRaw?: string | null;
  officePhoneRaw?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  companyName?: string | null;
  jobTitle?: string | null;
  location?: string | null;
  city?: string | null;
  country?: string | null;
  firstSeenClientId: string;
  firstSeenSourceType: UniverseSourceType;
  sourceLabel?: string | null;
  importBatchId?: string | null;
  rocketReachPersonId?: string | null;
  rawSourceMetadata?: object | null;
};

/**
 * Dedupe: email (unique) → LinkedIn → mobile → weak key.
 * Records a new attribution row for every successful import touch.
 */
export async function upsertContactUniverseAndRecordSource(
  db: DbClient,
  input: UpsertUniverseInput,
): Promise<{ universeId: string; created: boolean }> {
  const emailNormalized = input.emailNormalized?.trim().toLowerCase() || null;
  const linkedinUrlNormalized = normalizeLinkedInUrl(input.linkedInRaw);
  const mobilePhoneNormalized = normalizePhoneDigits(input.mobilePhoneRaw);
  const officePhoneNormalized = normalizePhoneDigits(input.officePhoneRaw);

  const companyName = input.companyName?.trim() || null;
  const fullName = input.fullName?.trim() || null;
  const jobTitle = input.jobTitle?.trim() || null;

  let weakMatchKey: string | null = null;
  if (!emailNormalized && !linkedinUrlNormalized && !mobilePhoneNormalized) {
    if (companyName && fullName) {
      weakMatchKey = buildWeakMatchKey({
        company: companyName,
        fullName,
        title: jobTitle ?? "",
      });
    }
  }

  let existing =
    emailNormalized != null
      ? await db.contactUniverse.findUnique({
          where: { emailNormalized },
        })
      : null;

  if (!existing && linkedinUrlNormalized) {
    existing = await db.contactUniverse.findFirst({
      where: { linkedinUrlNormalized },
      orderBy: { firstSeenAt: "asc" },
    });
  }

  if (!existing && mobilePhoneNormalized) {
    existing = await db.contactUniverse.findFirst({
      where: { mobilePhoneNormalized },
      orderBy: { firstSeenAt: "asc" },
    });
  }

  if (!existing && weakMatchKey) {
    existing = await db.contactUniverse.findUnique({
      where: { weakMatchKey },
    });
  }

  const now = new Date();
  const summaryChunk =
    input.sourceLabel?.trim() ||
    (input.firstSeenSourceType === "CSV_IMPORT"
      ? "CSV import"
      : input.firstSeenSourceType === "ROCKETREACH"
        ? "RocketReach"
        : input.firstSeenSourceType);

  if (!existing) {
    const created = await db.contactUniverse.create({
      data: {
        emailNormalized,
        linkedinUrlNormalized,
        mobilePhoneNormalized,
        officePhoneNormalized,
        firstName: input.firstName?.trim() || null,
        lastName: input.lastName?.trim() || null,
        fullName,
        jobTitle,
        companyName,
        location: input.location?.trim() || null,
        city: input.city?.trim() || null,
        country: input.country?.trim() || null,
        sourceSummary: summaryChunk,
        firstSeenClientId: input.firstSeenClientId,
        firstSeenSourceType: input.firstSeenSourceType,
        firstSeenAt: now,
        lastSeenAt: now,
        weakMatchKey,
      },
    });

    await db.contactUniverseSource.create({
      data: {
        universeContactId: created.id,
        clientId: input.firstSeenClientId,
        sourceType: input.firstSeenSourceType,
        sourceLabel: input.sourceLabel?.trim() || null,
        importBatchId: input.importBatchId ?? null,
        rocketReachPersonId: input.rocketReachPersonId ?? null,
        rawSourceMetadata: input.rawSourceMetadata ?? undefined,
      },
    });

    return { universeId: created.id, created: true };
  }

  const mergedSummary = appendSummary(existing.sourceSummary, summaryChunk);

  await db.contactUniverse.update({
    where: { id: existing.id },
    data: {
      lastSeenAt: now,
      emailNormalized: emailNormalized ?? existing.emailNormalized,
      linkedinUrlNormalized: preferText(existing.linkedinUrlNormalized, linkedinUrlNormalized),
      mobilePhoneNormalized: preferText(existing.mobilePhoneNormalized, mobilePhoneNormalized),
      officePhoneNormalized: preferText(existing.officePhoneNormalized, officePhoneNormalized),
      firstName: preferText(existing.firstName, input.firstName),
      lastName: preferText(existing.lastName, input.lastName),
      fullName: preferText(existing.fullName, fullName),
      jobTitle: preferText(existing.jobTitle, jobTitle),
      companyName: preferText(existing.companyName, companyName),
      location: preferText(existing.location, input.location),
      city: preferText(existing.city, input.city),
      country: preferText(existing.country, input.country),
      sourceSummary: mergedSummary ?? existing.sourceSummary,
    },
  });

  await db.contactUniverseSource.create({
    data: {
      universeContactId: existing.id,
      clientId: input.firstSeenClientId,
      sourceType: input.firstSeenSourceType,
      sourceLabel: input.sourceLabel?.trim() || null,
      importBatchId: input.importBatchId ?? null,
      rocketReachPersonId: input.rocketReachPersonId ?? null,
      rawSourceMetadata: input.rawSourceMetadata ?? undefined,
    },
  });

  return { universeId: existing.id, created: false };
}
