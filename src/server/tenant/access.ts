import "server-only";

import type { StaffUser } from "@/generated/prisma/client";
import { isOpensDoorsSuperadminStaff } from "@/lib/staff/opensdoors-superadmin";
import { prisma } from "@/lib/db";

/** Tenant-scoped access checks — requires `email` (all `StaffUser` rows have it). */
export type StaffForTenantAccess = Pick<StaffUser, "id" | "role" | "email">;

/** @deprecated Use {@link StaffForTenantAccess} */
export type StaffIdentity = StaffForTenantAccess;

/**
 * Only greg@opensdoors.co.uk may assign staff to client workspaces (not all MANAGER roles).
 */
export function canAssignClientWorkspaceMembership(staff: StaffForTenantAccess): boolean {
  return isOpensDoorsSuperadminStaff(staff);
}

/**
 * Returns client IDs this staff member may load or mutate.
 * Platform super-admin sees all workspaces; everyone else uses {@link prisma.clientMembership} only.
 */
export async function getAccessibleClientIds(
  staff: StaffForTenantAccess,
): Promise<string[]> {
  if (isOpensDoorsSuperadminStaff(staff)) {
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
  staff: StaffForTenantAccess,
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
