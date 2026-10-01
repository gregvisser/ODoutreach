import "server-only";

import type { ContactSource } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { ROCKETREACH_MAX_IMPORT } from "@/lib/clients/rocketreach-import-cap";
import {
  matchKnownSearchProfile,
  type RocketReachSearchIdentity,
} from "@/lib/clients/rocketreach-known-match";
import {
  extractDomainFromEmail,
  isValidEmailFormat,
  normalizeEmail,
} from "@/lib/normalize";
import { normalizeLinkedInUrl } from "@/lib/universe/normalize-identifiers";
import { attachContactsToClientList } from "@/server/contacts/contact-lists";
import { upsertContactUniverseAndRecordSource } from "@/server/contacts/contact-universe";
import { evaluateSuppression, refreshContactSuppressionFlagsForClient } from "@/server/outreach/suppression-guard";
import { loadKnownRocketReachIndexes } from "./known-profiles";

/** Documented RocketReach API v2 bases (see https://docs.rocketreach.co/reference/people-search-api). */
export const ROCKETREACH_API_V2_SEARCH =
  "https://api.rocketreach.co/api/v2/person/search";
export const ROCKETREACH_API_V2_LOOKUP =
  "https://api.rocketreach.co/api/v2/person/lookup";

const MAX_IMPORT = ROCKETREACH_MAX_IMPORT;

export type RocketReachLookupGovernor = {
  /** Reserve the credit before the paid HTTP call. `proceed: false` stops the run. */
  reserve: (profileId: number) => Promise<{ proceed: boolean; reason?: string }>;
  settle: (profileId: number, outcome: "charged" | "released" | "kept") => Promise<void>;
};

export type RocketReachImportInput = {
  clientId: string;
  /** Raw JSON body for POST /person/search — must include at least a `query` object. */
  searchBody: Record<string, unknown>;
  /** Existing list. Omit when `ensureContactList` creates the list only after a contact is ready. */
  contactListId?: string;
  ensureContactList?: () => Promise<{ id: string; name: string }>;
  /** List display name for Universe attribution. */
  targetListName: string;
  addedByStaffUserId?: string | null;
  /** Set on contacts created by automatic list top-up. */
  originNote?: string | null;
  sourceLabel?: string | null;
  governor?: RocketReachLookupGovernor;
};

export type RocketReachImportResult =
  | {
      ok: true;
      imported: number;
      importedWithoutLookup: number;
      skippedNoEmail: number;
      skippedInvalid: number;
      skippedDuplicate: number;
      skippedAlreadyKnown: number;
      flaggedSuppressed: number;
      creditsUsed: number;
      lookupsAttempted: number;
      searchProfileCount: number;
      errors: string[];
      contactListId: string | null;
      listAttachedAdded: number;
      listAttachedSkipped: number;
      universeCreated: number;
      universeMatched: number;
    }
  | { ok: false; error: string };

type LookupProfile = Record<string, unknown>;

export type RocketReachSearchHit = RocketReachSearchIdentity;

function extractSearchRows(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (json && typeof json === "object") {
    const record = json as Record<string, unknown>;
    for (const key of ["profiles", "people", "results", "data"]) {
      const value = record[key];
      if (Array.isArray(value)) return value;
    }
  }
  return [];
}

function collectEmails(profile: LookupProfile): string[] {
  const found: string[] = [];
  const candidates = [
    profile.recommended_professional_email,
    profile.recommended_email,
    profile.current_work_email,
    profile.recommended_personal_email,
    profile.current_personal_email,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const email = normalizeEmail(candidate);
      if (email && isValidEmailFormat(email)) found.push(email);
    }
  }
  const emails = profile.emails;
  if (Array.isArray(emails)) {
    for (const row of emails) {
      if (row && typeof row === "object" && "email" in row) {
        const email = normalizeEmail(String((row as { email?: string }).email ?? ""));
        if (email && isValidEmailFormat(email)) found.push(email);
      }
    }
  }
  return [...new Set(found)];
}

export function searchIdentityFromProfile(raw: unknown): RocketReachSearchHit | null {
  if (!raw || typeof raw !== "object") return null;
  const profile = raw as LookupProfile;
  const id = profile.id;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) return null;
  const linkedinUrl =
    typeof profile.linkedin_url === "string"
      ? profile.linkedin_url
      : typeof profile.linkedinUrl === "string"
        ? profile.linkedinUrl
        : null;
  return {
    id,
    name: typeof profile.name === "string" ? profile.name : null,
    title: typeof profile.current_title === "string" ? profile.current_title : null,
    employer: typeof profile.current_employer === "string" ? profile.current_employer : null,
    location: typeof profile.location === "string" ? profile.location : null,
    linkedinUrl,
    linkedinNormalized: normalizeLinkedInUrl(linkedinUrl),
    emails: collectEmails(profile),
  };
}

function pickEmailFromLookup(profile: LookupProfile): string | null {
  return collectEmails(profile)[0] ?? null;
}

function pickPhoneFromLookup(profile: LookupProfile, typeHints: readonly string[]): string | null {
  const phones = profile.phones;
  if (!Array.isArray(phones)) return null;
  const hints = typeHints.map((hint) => hint.toLowerCase());
  const typed: string[] = [];
  const untyped: string[] = [];
  for (const entry of phones) {
    if (typeof entry === "string") {
      const value = entry.trim();
      if (value) untyped.push(value);
      continue;
    }
    if (entry && typeof entry === "object") {
      const row = entry as { number?: unknown; type?: unknown };
      const raw = typeof row.number === "string" ? row.number.trim() : "";
      if (!raw) continue;
      const type = typeof row.type === "string" ? row.type.toLowerCase() : "";
      if (hints.some((hint) => type.includes(hint))) typed.push(raw);
      else untyped.push(raw);
    }
  }
  if (typed.length > 0) return typed[0] ?? null;
  if (hints.includes("office") && untyped.length > 0) return untyped[0] ?? null;
  return null;
}

function splitName(name: unknown): { first?: string; last?: string } {
  if (typeof name !== "string" || !name.trim()) return {};
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0] };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

type PersistCounters = {
  imported: number;
  skippedInvalid: number;
  skippedDuplicate: number;
  flaggedSuppressed: number;
  universeCreated: number;
  universeMatched: number;
  touchedContactIds: string[];
};

async function persistRocketReachContact(
  counters: PersistCounters,
  input: {
    clientId: string;
    profileId: number;
    email: string;
    profile: LookupProfile;
    originNote: string | null;
    sourceLabel: string;
  },
): Promise<void> {
  const norm = normalizeEmail(input.email);
  if (!norm || !isValidEmailFormat(norm)) {
    counters.skippedInvalid++;
    return;
  }
  const { first, last } = splitName(input.profile.name);
  const company = typeof input.profile.current_employer === "string" ? input.profile.current_employer : null;
  const title = typeof input.profile.current_title === "string" ? input.profile.current_title : null;
  const linkedin = typeof input.profile.linkedin_url === "string" ? input.profile.linkedin_url : null;
  const city = typeof input.profile.city === "string" && input.profile.city.trim() ? input.profile.city.trim() : null;
  const country =
    typeof input.profile.country === "string" && input.profile.country.trim() ? input.profile.country.trim() : null;
  const industry =
    typeof input.profile.company_industry === "string" && input.profile.company_industry.trim()
      ? input.profile.company_industry.trim()
      : typeof input.profile.industry === "string" && input.profile.industry.trim()
        ? input.profile.industry.trim()
        : null;
  const loc =
    typeof input.profile.location === "string" && input.profile.location.trim()
      ? input.profile.location.trim()
      : [input.profile.city, input.profile.region, input.profile.country]
          .filter((value) => typeof value === "string" && value.trim())
          .join(", ") || null;
  const mobilePhone = pickPhoneFromLookup(input.profile, ["mobile", "cell", "personal"]);
  const officePhone = pickPhoneFromLookup(input.profile, ["office", "work", "direct", "landline"]);
  const fullName =
    typeof input.profile.name === "string" && input.profile.name.trim()
      ? input.profile.name.trim()
      : [first, last].filter(Boolean).join(" ") || null;

  const existing = await prisma.contact.findUnique({
    where: { clientId_email: { clientId: input.clientId, email: norm } },
    select: { id: true },
  });
  const universe = await upsertContactUniverseAndRecordSource(prisma, {
    emailNormalized: norm,
    linkedInRaw: linkedin,
    mobilePhoneRaw: mobilePhone,
    officePhoneRaw: officePhone,
    firstName: first ?? null,
    lastName: last ?? null,
    fullName,
    companyName: company,
    jobTitle: title,
    location: loc,
    city,
    country,
    industry,
    firstSeenClientId: input.clientId,
    firstSeenSourceType: "ROCKETREACH",
    sourceLabel: input.sourceLabel,
    rocketReachPersonId: String(input.profileId),
    rawSourceMetadata: { rocketReachProfileId: input.profileId },
  });
  if (universe.created) counters.universeCreated++;
  else counters.universeMatched++;

  if (existing) {
    counters.skippedDuplicate++;
    await prisma.contact.updateMany({
      where: { id: existing.id, universeContactId: null },
      data: { universeContactId: universe.universeId },
    });
    counters.touchedContactIds.push(existing.id);
    return;
  }

  const source: ContactSource = "ROCKETREACH";
  const initialSuppression = await evaluateSuppression(input.clientId, norm, company || null);
  if (initialSuppression.suppressed) counters.flaggedSuppressed++;
  const contact = await prisma.contact.create({
    data: {
      isSuppressed: initialSuppression.suppressed,
      lastSuppressionCheckAt: new Date(),
      clientId: input.clientId,
      email: norm,
      emailDomain: extractDomainFromEmail(norm) || null,
      fullName,
      firstName: first ?? null,
      lastName: last ?? null,
      company,
      title,
      linkedIn: linkedin,
      mobilePhone,
      officePhone,
      location: loc,
      city,
      country,
      industry,
      source,
      originNote: input.originNote,
      universeContactId: universe.universeId,
    },
  });
  await prisma.rocketReachEnrichment.create({
    data: {
      clientId: input.clientId,
      contactId: contact.id,
      externalId: String(input.profileId),
      status: "FETCHED",
      rawPayload: {
        ...input.profile,
        _od: {
          linkedinUrl: linkedin,
          location: loc,
          importedAt: new Date().toISOString(),
          originNote: input.originNote,
        },
      } as object,
      fetchedAt: new Date(),
    },
  });
  counters.touchedContactIds.push(contact.id);
  counters.imported++;
}

function profileFromUniverse(fields: {
  email: string;
  fullName: string | null;
  companyName: string | null;
  jobTitle: string | null;
  linkedinUrl: string | null;
  location: string | null;
  city: string | null;
  country: string | null;
  industry: string | null;
}): LookupProfile {
  return {
    name: fields.fullName,
    current_employer: fields.companyName,
    current_title: fields.jobTitle,
    linkedin_url: fields.linkedinUrl,
    location: fields.location,
    city: fields.city,
    country: fields.country,
    company_industry: fields.industry,
    recommended_professional_email: fields.email,
  };
}

export async function searchRocketReachIdentities(
  searchBody: Record<string, unknown>,
): Promise<{ ok: true; identities: RocketReachSearchHit[] } | { ok: false; error: string }> {
  const apiKey = process.env.ROCKETREACH_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      error: "ROCKETREACH_API_KEY is not set — add it to the server environment to enable API import.",
    };
  }
  const requestedSize = searchBody.page_size ?? MAX_IMPORT;
  if (typeof requestedSize !== "number" || !Number.isSafeInteger(requestedSize) || requestedSize < 1) {
    return { ok: false, error: "Search batch size must be a positive whole number." };
  }
  const lookupLimit = Math.min(requestedSize, MAX_IMPORT);
  let searchRes: Response;
  try {
    searchRes = await fetch(ROCKETREACH_API_V2_SEARCH, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Api-Key": apiKey },
      body: JSON.stringify({ ...searchBody, page_size: lookupLimit }),
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "RocketReach search request failed" };
  }
  const searchText = await searchRes.text();
  let searchJson: unknown;
  try {
    searchJson = JSON.parse(searchText) as unknown;
  } catch {
    return { ok: false, error: `RocketReach search returned non-JSON (HTTP ${String(searchRes.status)})` };
  }
  if (!searchRes.ok) {
    return {
      ok: false,
      error: `RocketReach search failed (HTTP ${String(searchRes.status)}): ${searchText.slice(0, 500)}`,
    };
  }
  const identities: RocketReachSearchHit[] = [];
  const seen = new Set<number>();
  for (const row of extractSearchRows(searchJson)) {
    const identity = searchIdentityFromProfile(row);
    if (!identity || seen.has(identity.id)) continue;
    seen.add(identity.id);
    identities.push(identity);
    if (identities.length >= lookupLimit) break;
  }
  // An empty page is a normal search result. Search does not spend credits
  // (see rocketReachPersonSearchCostsCredits); blaming the credit balance here
  // sent staff to check ~68k remaining credits for a filter that matched nobody.
  return { ok: true, identities };
}

export async function importRocketReachPeopleForClient(
  input: RocketReachImportInput,
): Promise<RocketReachImportResult> {
  const apiKey = process.env.ROCKETREACH_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      error: "ROCKETREACH_API_KEY is not set — add it to the server environment to enable API import.",
    };
  }
  const { decideRocketReachSpend, loadRocketReachCeiling, recordRocketReachCreditUse } = await import(
    "@/server/tenant/feature-gate"
  );
  const { loadRocketReachCreditSnapshot } = await import("./account");
  const ceiling = await loadRocketReachCeiling(input.clientId);
  let balance: number | "unlimited" | "unknown" = "unknown";
  if (ceiling.enforced) {
    const snapshot = await loadRocketReachCreditSnapshot();
    balance = snapshot.state === "ready" ? snapshot.remaining : "unknown";
    const decision = decideRocketReachSpend({ ceiling, balance, requested: 1 });
    if (decision.allowed < 1) {
      return { ok: false, error: decision.stopReason ?? "RocketReach buying is not available for this organisation." };
    }
  }
  const searched = await searchRocketReachIdentities(input.searchBody);
  if (!searched.ok) return searched;
  const identities = searched.identities;

  const known = await loadKnownRocketReachIndexes(input.clientId, identities);
  const counters: PersistCounters = {
    imported: 0,
    skippedInvalid: 0,
    skippedDuplicate: 0,
    flaggedSuppressed: 0,
    universeCreated: 0,
    universeMatched: 0,
    touchedContactIds: [],
  };
  let skippedNoEmail = 0;
  let skippedAlreadyKnown = 0;
  let importedWithoutLookup = 0;
  let creditsUsed = 0;
  let spentThisRun = 0;
  let lookupsAttempted = 0;
  const errors: string[] = [];
  const sourceLabel = input.sourceLabel?.trim() || `RocketReach → ${input.targetListName}`;
  const originNote = input.originNote?.trim() || null;

  for (const identity of identities) {
    const match = matchKnownSearchProfile(identity, known);
    if (match?.kind === "client") {
      skippedAlreadyKnown++;
      counters.touchedContactIds.push(match.contactId);
      continue;
    }
    if (match?.kind === "known-incomplete") {
      skippedAlreadyKnown++;
      skippedNoEmail++;
      continue;
    }
    if (match?.kind === "universe") {
      skippedAlreadyKnown++;
      const before = counters.imported;
      await persistRocketReachContact(counters, {
        clientId: input.clientId,
        profileId: identity.id,
        email: match.fields.email,
        profile: profileFromUniverse(match.fields),
        originNote,
        sourceLabel,
      });
      if (counters.imported > before) importedWithoutLookup++;
      continue;
    }

    let reserved = false;
    let outcome: "charged" | "released" | "kept" = "kept";
    try {
      if (ceiling.enforced) {
        const remainingBalance =
          typeof balance === "number" ? Math.max(0, balance - spentThisRun) : balance;
        const next = decideRocketReachSpend({
          ceiling: { ...ceiling, used: ceiling.used + spentThisRun },
          balance: remainingBalance,
          requested: 1,
        });
        if (next.allowed < 1) {
          errors.push(next.stopReason ?? "RocketReach buying is not available for this organisation.");
          break;
        }
      }
      if (input.governor) {
        const reservation = await input.governor.reserve(identity.id);
        if (!reservation.proceed) {
          errors.push(reservation.reason ?? "Stopped before a paid lookup.");
          break;
        }
        reserved = true;
      }
      lookupsAttempted++;
      const url = new URL(ROCKETREACH_API_V2_LOOKUP);
      url.searchParams.set("id", String(identity.id));
      let lookupRes: Response;
      try {
        lookupRes = await fetch(url.toString(), { headers: { "Api-Key": apiKey } });
      } catch (error) {
        errors.push(`id ${String(identity.id)}: ${error instanceof Error ? error.message : "lookup failed"}`);
        continue;
      }
      const lookupText = await lookupRes.text();
      let lookupJson: unknown;
      try {
        lookupJson = JSON.parse(lookupText) as unknown;
      } catch {
        counters.skippedInvalid++;
        continue;
      }
      if (!lookupRes.ok) {
        errors.push(`id ${String(identity.id)}: HTTP ${String(lookupRes.status)}`);
        continue;
      }
      const profile = lookupJson as LookupProfile;
      const email = pickEmailFromLookup(profile);
      if (!email) {
        outcome = "released";
        skippedNoEmail++;
        continue;
      }
      outcome = "charged";
      creditsUsed++;
      spentThisRun++;
      if (ceiling.organisationId) {
        await recordRocketReachCreditUse(ceiling.organisationId, 1);
      }
      await persistRocketReachContact(counters, {
        clientId: input.clientId,
        profileId: identity.id,
        email,
        profile,
        originNote,
        sourceLabel,
      });
    } finally {
      if (reserved && input.governor) await input.governor.settle(identity.id, outcome);
    }
  }

  let contactListId = input.contactListId ?? null;
  let listAttachedAdded = 0;
  let listAttachedSkipped = 0;
  if (counters.touchedContactIds.length > 0) {
    if (!contactListId) {
      if (!input.ensureContactList) {
        return { ok: false, error: "Choose a list before importing." };
      }
      const created = await input.ensureContactList();
      contactListId = created.id;
    }
    const attachResult = await attachContactsToClientList({
      clientId: input.clientId,
      contactListId,
      contactIds: counters.touchedContactIds,
      addedByStaffUserId: input.addedByStaffUserId ?? null,
    });
    listAttachedAdded = attachResult.added;
    listAttachedSkipped = attachResult.skipped;
  }
  await refreshContactSuppressionFlagsForClient(input.clientId);
  return {
    ok: true,
    imported: counters.imported,
    importedWithoutLookup,
    skippedNoEmail,
    skippedInvalid: counters.skippedInvalid,
    skippedDuplicate: counters.skippedDuplicate,
    skippedAlreadyKnown,
    flaggedSuppressed: counters.flaggedSuppressed,
    creditsUsed,
    lookupsAttempted,
    searchProfileCount: identities.length,
    errors: errors.slice(0, 12),
    contactListId,
    listAttachedAdded,
    listAttachedSkipped,
    universeCreated: counters.universeCreated,
    universeMatched: counters.universeMatched,
  };
}
