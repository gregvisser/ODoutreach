import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * The organisation a client belongs to. Null when the client row is gone.
 * Callers that cannot resolve an organisation must not read another
 * organisation's rows in its place.
 */
/** Home organisation of a staff member. Null when they have no membership. */
export async function organisationIdForStaff(staffId: string): Promise<string | null> {
  const home = await loadStaffHomeOrganisation(staffId);
  return home?.organisationId ?? null;
}

export type StaffHomeOrganisation = {
  organisationId: string;
  role: "OWNER" | "ADMIN" | "USER";
  status: "ACTIVE" | "SUSPENDED";
  name: string;
};

/**
 * Home organisation plus the role and status the shell and settings need.
 * Null when the staff member has no membership. Does not fall back to OpensDoors.
 */
export async function loadStaffHomeOrganisation(
  staffId: string,
): Promise<StaffHomeOrganisation | null> {
  if (!staffId) return null;
  const row = await prisma.organisationMember.findUnique({
    where: { staffUserId: staffId },
    select: {
      organisationId: true,
      role: true,
      organisation: { select: { status: true, name: true } },
    },
  });
  if (!row) return null;
  return {
    organisationId: row.organisationId,
    role: row.role,
    status: row.organisation.status,
    name: row.organisation.name,
  };
}

export async function organisationIdForClient(
  clientId: string,
  db: Db = prisma,
): Promise<string | null> {
  if (!clientId) return null;
  const row = await db.client.findUnique({
    where: { id: clientId },
    select: { organisationId: true },
  });
  return row?.organisationId ?? null;
}

export type ClientOrganisationGroup = {
  organisationId: string | null;
  clientIds: string[];
};

/**
 * Split a staff-visible client list by organisation. One organisation is the
 * common case (every OpensDoors client). A platform admin looking across
 * organisations gets one group per organisation so a seed list or cooldown
 * from one group is never applied to another.
 */
export async function partitionClientIdsByOrganisation(
  clientIds: readonly string[],
): Promise<ClientOrganisationGroup[]> {
  if (clientIds.length === 0) return [];
  const rows = await prisma.client.findMany({
    where: { id: { in: [...clientIds] } },
    select: { id: true, organisationId: true },
  });
  const orgById = new Map(rows.map((row) => [row.id, row.organisationId]));
  const groups = new Map<string | null, string[]>();
  for (const id of clientIds) {
    const organisationId = orgById.get(id) ?? null;
    const bucket = groups.get(organisationId);
    if (bucket) bucket.push(id);
    else groups.set(organisationId, [id]);
  }
  return [...groups.entries()].map(([organisationId, ids]) => ({
    organisationId,
    clientIds: ids,
  }));
}
