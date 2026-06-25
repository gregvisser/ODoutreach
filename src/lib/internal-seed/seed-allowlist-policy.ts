/**
 * Feature A (production hardening) — pure helpers for the internal seed /
 * allowlist. No Prisma, no env, no I/O — safe to import anywhere and unit-test
 * without a database.
 *
 * The internal seed list is a small set of OpensDoors-internal test addresses
 * that must ALWAYS be deliverable (exempt from the suppression gate) and that
 * no automated process may suppress. See `src/server/internal-seed/seed-allowlist.ts`
 * for the database-backed, flag-gated runtime, and the `InternalSeedAddress`
 * model in prisma/schema.prisma.
 */

import { normalizeEmail } from "@/lib/normalize";

/** The default seed addresses, matching the migration seed. */
export const INTERNAL_SEED_DEFAULT_ADDRESSES: ReadonlyArray<{
  email: string;
  label: string;
}> = [
  { email: "adam@opensdoors.co.uk", label: "Adam (internal test)" },
  { email: "elys@opensdoors.co.uk", label: "Elys (internal test)" },
  { email: "lucysg@opensdoors.co.uk", label: "Lucy SG (internal test)" },
  { email: "james@opensdoors.co.uk", label: "James (internal test)" },
  { email: "joe@opensdoors.co.uk", label: "Joe (internal test)" },
  { email: "samantha@opensdoors.co.uk", label: "Samantha (internal test)" },
];

/**
 * Normalize an address the same way the suppression / sending keys do, so a
 * seed-list membership test keys identically to the gate it exempts.
 */
export function normalizeSeedEmail(raw: string | null | undefined): string {
  if (typeof raw !== "string") return "";
  return normalizeEmail(raw);
}

/**
 * Build a normalized lookup set from a list of seed emails. Empty/invalid
 * entries are dropped.
 */
export function buildSeedEmailSet(emails: Iterable<string>): Set<string> {
  const set = new Set<string>();
  for (const e of emails) {
    const n = normalizeSeedEmail(e);
    if (n) set.add(n);
  }
  return set;
}

/**
 * True when `email` (after normalization) is in the provided seed set. Pure —
 * the caller supplies the set (loaded from the DB at the server boundary).
 */
export function isEmailInSeedSet(
  email: string | null | undefined,
  seedSet: ReadonlySet<string>,
): boolean {
  const n = normalizeSeedEmail(email);
  if (!n) return false;
  return seedSet.has(n);
}
