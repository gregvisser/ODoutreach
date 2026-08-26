import "server-only";

import type { StaffRole } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";

/**
 * In-account staff roles were removed (2026-06): every active staff member gets
 * every feature. The `role` column still exists on StaffUser but is no longer
 * read for access decisions — these helpers now return the same answer for
 * everyone. What is DELIBERATELY preserved is tenant isolation: staff may only
 * ever act on a real, live (non-soft-deleted) client workspace, enforced by
 * `getAccessibleClientIds` + `requireClientAccess`. Destructive whole-workspace
 * ops stay gated on the per-account `isSuperAdmin` capability (see canDeleteWorkspace).
 */

export type StaffIdentity = {
  id: string;
  /** Retained for back-compat; no longer used for any access decision. */
  role: StaffRole;
};

/** Roles removed — any active staff member may assign workspace membership. */
export function canAssignClientWorkspaceMembership(staff: StaffIdentity): boolean {
  void staff;
  return true;
}

/**
 * F3 — the "re-engage" override bypasses the 10-day outreach cooldown to re-use
 * an older list. It NEVER bypasses suppression (unsubscribe / DNC) or hard
 * bounces. Roles removed — any active staff member may use it.
 */
export function canUseCooldownReengage(staff: StaffIdentity): boolean {
  void staff;
  return true;
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
 * THE tenant wall, in one place. Both the list form (`getAccessibleClientIds`)
 * and the single-id form (`canAccessClient`) build their query from this, so the
 * two can never drift apart — if the wall is ever narrowed (e.g. scoped to
 * `ClientMembership`, which `specs/BC-01-tenant-isolation.md` records as the
 * likely future), narrowing it here narrows both at once.
 *
 * Roles removed: every active staff member may access every LIVE client. The
 * `deletedAt: null` filter is the wall that survives — soft-deleted workspaces
 * stay invisible to all normal paths (only `listSoftDeletedClients`, which is
 * super-admin-gated, can see them).
 */
function accessibleClientWhere(staff: StaffIdentity) {
  void staff;
  return { deletedAt: null } as const;
}

/**
 * Returns client IDs this staff member may load or mutate. Never use raw `clientId`
 * from the client without intersecting with this list.
 *
 * This reads every live client row, so use it ONLY when the caller genuinely
 * needs the whole list (a clients index, a cross-client report). To answer
 * "may this staff member touch THIS one client?", call `canAccessClient` /
 * `requireClientAccess` instead — they ask the database about one indexed row
 * rather than dragging the table back to compare in JavaScript.
 */
export async function getAccessibleClientIds(
  staff: StaffIdentity,
): Promise<string[]> {
  const rows = await prisma.client.findMany({
    where: accessibleClientWhere(staff),
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/**
 * "May this staff member access this ONE workspace?" — the same wall as
 * `getAccessibleClientIds`, asked about a single primary-key row.
 *
 * Semantically identical to `(await getAccessibleClientIds(staff)).includes(id)`
 * and deliberately built from the same `accessibleClientWhere` predicate; the
 * difference is only that it does not read every other client to answer.
 */
export async function canAccessClient(
  staff: StaffIdentity,
  clientId: string,
): Promise<boolean> {
  if (!clientId) return false;
  const row = await prisma.client.findFirst({
    where: { ...accessibleClientWhere(staff), id: clientId },
    select: { id: true },
  });
  return row !== null;
}

/**
 * Throws if staff cannot access the workspace. Use in server actions and mutations.
 */
export async function requireClientAccess(
  staff: StaffIdentity,
  clientId: string,
): Promise<void> {
  if (!(await canAccessClient(staff, clientId))) {
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
