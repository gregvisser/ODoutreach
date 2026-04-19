import "server-only";

import type { ContactSource } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import {
  extractDomainFromEmail,
  isValidEmailFormat,
  normalizeEmail,
} from "@/lib/normalize";
import { refreshContactSuppressionFlagsForClient } from "@/server/outreach/suppression-guard";

/** Documented RocketReach API v2 bases (see https://docs.rocketreach.co/reference/people-search-api). */
export const ROCKETREACH_API_V2_SEARCH =
  "https://api.rocketreach.co/api/v2/person/search";
export const ROCKETREACH_API_V2_LOOKUP =
  "https://api.rocketreach.co/api/v2/person/lookup";

const MAX_IMPORT = 10;

export type RocketReachImportInput = {
  clientId: string;
  /** Raw JSON body for POST /person/search — must include at least a `query` object. */
  searchBody: Record<string, unknown>;
};

export type RocketReachImportResult =
  | {
      ok: true;
      imported: number;
      skippedNoEmail: number;
      skippedInvalid: number;
      skippedDuplicate: number;
      errors: string[];
    }
  | { ok: false; error: string };

type SearchProfile = { id?: number };
type LookupProfile = Record<string, unknown>;

function extractSearchProfiles(json: unknown): SearchProfile[] {
  if (Array.isArray(json)) return json as SearchProfile[];
  if (json && typeof json === "object") {
    const o = json as Record<string, unknown>;
    for (const key of ["profiles", "people", "results", "data"]) {
      const v = o[key];
      if (Array.isArray(v)) return v as SearchProfile[];
    }
  }
  return [];
}

function pickEmailFromLookup(p: LookupProfile): string | null {
  const candidates = [
    p.recommended_professional_email,
    p.recommended_email,
    p.current_work_email,
    p.recommended_personal_email,
    p.current_personal_email,
  ];
  for (const c of candidates) {
    if (typeof c === "string") {
      const e = normalizeEmail(c);
      if (e && isValidEmailFormat(e)) return e;
    }
  }
  const emails = p.emails;
  if (Array.isArray(emails)) {
    for (const row of emails) {
      if (row && typeof row === "object" && "email" in row) {
        const e = normalizeEmail(String((row as { email?: string }).email ?? ""));
        if (e && isValidEmailFormat(e)) return e;
      }
    }
  }
  return null;
}

function splitName(name: unknown): { first?: string; last?: string } {
  if (typeof name !== "string" || !name.trim()) return {};
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0] };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

export async function importRocketReachPeopleForClient(
  input: RocketReachImportInput,
): Promise<RocketReachImportResult> {
  const apiKey = process.env.ROCKETREACH_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      error:
        "ROCKETREACH_API_KEY is not set — add it to the server environment to enable API import.",
    };
  }

  const { clientId, searchBody } = input;
  const headers = {
    "Content-Type": "application/json",
    "Api-Key": apiKey,
  };

  let searchRes: Response;
  try {
    searchRes = await fetch(ROCKETREACH_API_V2_SEARCH, {
      method: "POST",
      headers,
      body: JSON.stringify(searchBody),
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "RocketReach search request failed",
    };
  }

  const searchText = await searchRes.text();
  let searchJson: unknown;
  try {
    searchJson = JSON.parse(searchText) as unknown;
  } catch {
    return {
      ok: false,
      error: `RocketReach search returned non-JSON (HTTP ${String(searchRes.status)})`,
    };
  }

  if (!searchRes.ok) {
    return {
      ok: false,
      error: `RocketReach search failed (HTTP ${String(searchRes.status)}): ${searchText.slice(0, 500)}`,
    };
  }

  const profiles: SearchProfile[] = extractSearchProfiles(searchJson);
  const ids = profiles
    .map((p) => p.id)
    .filter((id): id is number => typeof id === "number" && id > 0)
    .slice(0, MAX_IMPORT);

  if (ids.length === 0) {
    return {
      ok: false,
      error: "RocketReach search returned no profile ids — refine the query or check API credits.",
    };
  }

  let imported = 0;
  let skippedNoEmail = 0;
  let skippedInvalid = 0;
  let skippedDuplicate = 0;
  const errors: string[] = [];

  for (const id of ids) {
    let lookupRes: Response;
    try {
      const url = new URL(ROCKETREACH_API_V2_LOOKUP);
      url.searchParams.set("id", String(id));
      lookupRes = await fetch(url.toString(), { headers: { "Api-Key": apiKey } });
    } catch (e) {
      errors.push(`id ${String(id)}: ${e instanceof Error ? e.message : "lookup failed"}`);
      continue;
    }

    const lookupText = await lookupRes.text();
    let lookupJson: unknown;
    try {
      lookupJson = JSON.parse(lookupText) as unknown;
    } catch {
      skippedInvalid++;
      continue;
    }

    if (!lookupRes.ok) {
      errors.push(`id ${String(id)}: HTTP ${String(lookupRes.status)}`);
      continue;
    }

    const profile = lookupJson as LookupProfile;
    const email = pickEmailFromLookup(profile);
    if (!email) {
      skippedNoEmail++;
      continue;
    }

    const norm = normalizeEmail(email);
    if (!norm || !isValidEmailFormat(norm)) {
      skippedInvalid++;
      continue;
    }

    const existing = await prisma.contact.findUnique({
      where: { clientId_email: { clientId, email: norm } },
      select: { id: true },
    });
    if (existing) {
      skippedDuplicate++;
      continue;
    }

    const { first, last } = splitName(profile.name);
    const company =
      typeof profile.current_employer === "string" ? profile.current_employer : null;
    const title =
      typeof profile.current_title === "string" ? profile.current_title : null;
    const linkedin =
      typeof profile.linkedin_url === "string" ? profile.linkedin_url : null;
    const loc =
      typeof profile.location === "string"
        ? profile.location
        : [profile.city, profile.region, profile.country]
            .filter((x) => typeof x === "string")
            .join(", ") || null;

    const emailDomain = extractDomainFromEmail(norm) || null;
    const fullName =
      typeof profile.name === "string" && profile.name.trim()
        ? profile.name.trim()
        : [first, last].filter(Boolean).join(" ") || null;

    const source: ContactSource = "ROCKETREACH";

    const contact = await prisma.contact.create({
      data: {
        clientId,
        email: norm,
        emailDomain,
        fullName,
        firstName: first ?? null,
        lastName: last ?? null,
        company,
        title,
        source,
      },
    });

    const metaPayload = {
      ...profile,
      _od: {
        linkedinUrl: linkedin,
        location: loc,
        importedAt: new Date().toISOString(),
      },
    };

    await prisma.rocketReachEnrichment.create({
      data: {
        clientId,
        contactId: contact.id,
        externalId: String(id),
        status: "FETCHED",
        rawPayload: metaPayload as object,
        fetchedAt: new Date(),
      },
    });

    imported++;
  }

  await refreshContactSuppressionFlagsForClient(clientId);

  return {
    ok: true,
    imported,
    skippedNoEmail,
    skippedInvalid,
    skippedDuplicate,
    errors: errors.slice(0, 12),
  };
}
