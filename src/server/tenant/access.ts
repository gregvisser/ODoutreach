import "server-only";

import type { StaffRole } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";

/**
 * Roles that may see/operate on all client workspaces (internal ops staff).
 * OPERATOR is included: operators are trusted staff who do the day-to-day
 * outreach work across every client, so they no longer need per-client
 * membership to access a workspace. VIEWER stays membership-scoped + read-only.
 */
const GLOBAL_CLIENT_ACCESS_ROLES: StaffRole[] = ["ADMIN", "MANAGER", "OPERATOR"];

/** Roles allowed to assign other staff to client workspaces (admin-level). */
const MEMBERSHIP_ASSIGNMENT_ROLES: StaffRole[] = ["ADMIN", "MANAGER"];

export type StaffIdentity = {
  id: string;
  role: StaffRole;
};

/** ADMIN/MANAGER may assign OPERATOR/VIEWER staff to client workspaces via `ClientMembership`. */
export function canAssignClientWorkspaceMembership(staff: StaffIdentity): boolean {
  return MEMBERSHIP_ASSIGNMENT_ROLES.includes(staff.role);
}

/**
 * F3 — roles that may use the "re-engage" override: bypassing the 21-day
 * outreach cooldown to re-use an older list. Senior staff only. The override
 * NEVER bypasses suppression (unsubscribe / DNC) or hard bounces.
 */
const COOLDOWN_REENGAGE_ROLES: StaffRole[] = ["ADMIN", "MANAGER"];

/** True if this staff member may bypass the outreach cooldown timer (re-engage). */
export function canUseCooldownReengage(staff: StaffIdentity): boolean {
  return COOLDOWN_REENGAGE_ROLES.includes(staff.role);
}

/**
 * F2 — only a super-admin may soft-delete / restore / purge a whole client
 * workspace. This is gated on the per-account `isSuperAdmin` capability, NOT
 * on a role enum value and NOT on an email string, so the permission travels
 * with the account and is auditable. Currently assigned to greg@bidlow.co.uk.
 */
export function canDeleteWorkspace(staff: { isSuperAdmin: boolean }): boolean {
  return staff.isSuperAdmin === true;
}

/**
 * Returns client IDs this staff member may load or mutate. Never use raw `clientId`
 * from the client without intersecting with this list.
 */
export async function getAccessibleClientIds(
  staff: StaffIdentity,
): Promise<string[]> {
  if (GLOBAL_CLIENT_ACCESS_ROLES.includes(staff.role)) {
    // F2 — soft-deleted workspaces are invisible to all normal access paths.
    // Only the dedicated super-admin recovery view (`listSoftDeletedClients`)
    // may see them.
    const rows = await prisma.client.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  const memberships = await prisma.clientMembership.findMany({
    // F2 — exclude memberships whose workspace has been soft-deleted.
    where: { staffUserId: staff.id, client: { deletedAt: null } },
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
