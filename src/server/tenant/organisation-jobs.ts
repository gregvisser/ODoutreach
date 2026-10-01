import "server-only";

import { prisma } from "@/lib/db";
import type { OrganisationJobTarget } from "@/lib/tenant/organisation-jobs";

/**
 * Active and suspended organisations, with the live client ids each one owns.
 * The runner decides whether a suspended organisation is skipped.
 */
export async function listOrganisationJobTargets(): Promise<OrganisationJobTarget[]> {
  const rows = await prisma.organisation.findMany({
    orderBy: { slug: "asc" },
    select: {
      id: true,
      slug: true,
      status: true,
      clients: {
        where: { deletedAt: null },
        select: { id: true },
        orderBy: { id: "asc" },
      },
    },
  });
  return rows.map((row) => ({
    organisationId: row.id,
    slug: row.slug,
    status: row.status,
    clientIds: row.clients.map((client) => client.id),
  }));
}

/**
 * The organisations that own this exact client list, in first-seen order.
 * Unknown ids are left out. An empty list is an empty run, not every client.
 */
export async function targetsForClientIds(
  clientIds: readonly string[],
): Promise<OrganisationJobTarget[]> {
  if (clientIds.length === 0) return [];
  const rows = await prisma.client.findMany({
    where: { id: { in: [...clientIds] } },
    select: {
      id: true,
      organisation: { select: { id: true, slug: true, status: true } },
    },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const groups = new Map<string, OrganisationJobTarget>();
  for (const id of clientIds) {
    const row = byId.get(id);
    if (!row) continue;
    const existing = groups.get(row.organisation.id);
    if (existing) {
      existing.clientIds.push(id);
      continue;
    }
    groups.set(row.organisation.id, {
      organisationId: row.organisation.id,
      slug: row.organisation.slug,
      status: row.organisation.status,
      clientIds: [id],
    });
  }
  return [...groups.values()];
}
