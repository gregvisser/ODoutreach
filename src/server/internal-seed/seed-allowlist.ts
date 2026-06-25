import "server-only";

import { prisma } from "@/lib/db";
import { normalizeSeedEmail } from "@/lib/internal-seed/seed-allowlist-policy";

/**
 * Feature A (production hardening) — database-backed, flag-gated runtime for the
 * internal seed / allowlist.
 *
 * Internal seed addresses are OpensDoors-internal test addresses that are
 * ALWAYS deliverable (exempt from the send-time suppression gate) and that NO
 * automated process (import, suppression refresh, hard-bounce, spam-complaint)
 * may add to suppression.
 *
 * SAFETY: the whole feature is INERT unless `INTERNAL_SEED_ALLOWLIST_ENABLED`
 * is `true`. Every read helper short-circuits on the flag BEFORE any DB query,
 * so with the flag off there is no behaviour change and no extra query on the
 * live send path. The admin write helpers do not check the flag (so the list
 * can be curated before enabling); the gate/guard READ helpers do.
 */

export function isInternalSeedAllowlistEnabled(): boolean {
  return (
    (process.env.INTERNAL_SEED_ALLOWLIST_ENABLED ?? "").trim().toLowerCase() ===
    "true"
  );
}

/**
 * Active seed emails (normalized). Returns `[]` when the flag is OFF — so every
 * caller (suppression gate, analytics exclusion) behaves exactly as before when
 * the feature is disabled, without hitting the database.
 */
export async function listActiveInternalSeedEmails(): Promise<string[]> {
  if (!isInternalSeedAllowlistEnabled()) return [];
  const rows = await prisma.internalSeedAddress.findMany({
    where: { isActive: true },
    select: { email: true },
  });
  return rows.map((r) => r.email);
}

/**
 * True only when the flag is ON and `email` (normalized) is an ACTIVE seed
 * address. Default (flag OFF) is always `false`, preserving prior behaviour and
 * doing no I/O. Used by the suppression gate and the suppression-write guards.
 */
export async function isInternalSeedAddress(email: string): Promise<boolean> {
  if (!isInternalSeedAllowlistEnabled()) return false;
  const normalized = normalizeSeedEmail(email);
  if (!normalized) return false;
  const hit = await prisma.internalSeedAddress.findFirst({
    where: { email: normalized, isActive: true },
    select: { id: true },
  });
  return hit !== null;
}

// ---------------------------------------------------------------------------
// Admin (super-admin) management helpers. These are NOT flag-gated — the list
// can be curated before the feature is switched on. The action layer enforces
// `requireSuperAdmin`.
// ---------------------------------------------------------------------------

export type InternalSeedAddressRow = {
  id: string;
  email: string;
  label: string | null;
  note: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export async function listAllInternalSeedAddresses(): Promise<
  InternalSeedAddressRow[]
> {
  return prisma.internalSeedAddress.findMany({
    orderBy: [{ isActive: "desc" }, { email: "asc" }],
    select: {
      id: true,
      email: true,
      label: true,
      note: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

/**
 * Add (or re-activate) a seed address. Idempotent on the unique email: an
 * existing row is re-activated and its label/note refreshed rather than
 * duplicated. Returns `null` when the email is blank/invalid.
 */
export async function upsertInternalSeedAddress(input: {
  email: string;
  label?: string | null;
  note?: string | null;
  staffUserId?: string | null;
}): Promise<InternalSeedAddressRow | null> {
  const email = normalizeSeedEmail(input.email);
  if (!email || !email.includes("@")) return null;
  const label = input.label?.trim() || null;
  const note = input.note?.trim() || null;
  return prisma.internalSeedAddress.upsert({
    where: { email },
    create: {
      email,
      label,
      note,
      isActive: true,
      createdByStaffUserId: input.staffUserId ?? null,
    },
    update: {
      isActive: true,
      ...(label !== null ? { label } : {}),
      ...(note !== null ? { note } : {}),
    },
    select: {
      id: true,
      email: true,
      label: true,
      note: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

/** Soft on/off — deactivating leaves the row (and its history) in place. */
export async function setInternalSeedAddressActive(
  id: string,
  isActive: boolean,
): Promise<void> {
  await prisma.internalSeedAddress.update({
    where: { id },
    data: { isActive },
  });
}
