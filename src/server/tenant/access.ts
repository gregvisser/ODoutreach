import "server-only";

import type { StaffRole } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";

/** Roles that may see all client workspaces (internal ops). */
const GLOBAL_CLIENT_ACCESS_ROLES: StaffRole[] = ["ADMIN", "MANAGER"];

export type StaffIdentity = {
  id: string;
  role: StaffRole;
};

/**
 * Returns client IDs this staff member may load or mutate. Never use raw `clientId`
 * from the client without intersecting with this list.
 */
export async function getAccessibleClientIds(
  staff: StaffIdentity,
): Promise<string[]> {
  if (GLOBAL_CLIENT_ACCESS_ROLES.includes(staff.role)) {
    const rows = await prisma.client.findMany({ select: { id: true } });
    return rows.map((r) => r.id);
  }

  const memberships = await prisma.clientMembership.findMany({
    where: { staffUserId: staff.id },
    select: { clientId: true },
  });
  return memberships.map((m) => m.clientId);
}

/**
 * Throws if staff cannot access the workspace. Use in server actions and mutations.
 */
export async function requireClientAccess(
  staff: StaffIdentity,
  clientId: string,
): Promise<void> {
  const allowed = await getAccessibleClientIds(staff);
  if (!allowed.includes(clientId)) {
    throw new Error("FORBIDDEN_CLIENT");
  }
}

/** Use when you already have the accessible id list (e.g. from a parent loader). */
export function assertClientInAccessibleList(
  clientId: string,
  accessibleClientIds: string[],
): void {
  if (!accessibleClientIds.includes(clientId)) {
    throw new Error("FORBIDDEN_CLIENT");
  }
}

/** Prisma `where` fragment for tenant-owned rows (add model-specific fields as needed). */
export function whereInAccessibleClients(accessibleClientIds: string[]) {
  if (accessibleClientIds.length === 0) {
    return { clientId: { in: [] as string[] } };
  }
  return { clientId: { in: accessibleClientIds } };
}

/**
 * Route handlers (`app/api/.../route.ts`) and workers: call `requireOpensDoorsStaff()` (or a
 * trusted job principal), then `requireClientAccess` with the target `clientId` before any
 * tenant-scoped Prisma call. Never trust `clientId` from the request body without that check.
 */
