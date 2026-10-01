import "server-only";

import type { StaffRole } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";

import { resolveStaffActingOrganisation } from "./acting-organisation";

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
 * Who this staff member may see.
 *
 * - `organisation`: every live client of the organisation they are working
 *   in. That is their membership, or the organisation a platform admin has
 *   entered. It is never every organisation at once.
 * - `none`: no organisation selected. Sees nothing.
 *
 * Internal cron routes are not staff. They authenticate with
 * PROCESS_QUEUE_SECRET and still walk every organisation's own client rows.
 * They must not copy one client's data into another.
 */
export type ClientAccessScope =
  | { kind: "organisation"; organisationId: string }
  | { kind: "none" };

export async function loadClientAccessScope(staffId: string): Promise<ClientAccessScope> {
  if (!staffId) return { kind: "none" };
  const acting = await resolveStaffActingOrganisation(staffId);
  if (!acting) return { kind: "none" };
  return { kind: "organisation", organisationId: acting.organisationId };
}

/**
 * Prisma filter for live clients this scope may touch. `none` matches no row.
 * Both the list form and the single-id form use this, so they cannot drift.
 */
export function accessibleClientWhere(scope: ClientAccessScope): {
  deletedAt: null;
  organisationId?: string;
  id?: { in: string[] };
} {
  if (scope.kind === "none") {
    return { deletedAt: null, id: { in: [] } };
  }
  return { deletedAt: null, organisationId: scope.organisationId };
}

/**
 * True when this staff member may act on a workspace in that organisation,
 * including a soft-deleted one. Normal reads still hide deleted rows via
 * `accessibleClientWhere`.
 */
export async function clientOrganisationAllowed(
  staff: { id: string },
  organisationId: string,
): Promise<boolean> {
  const scope = await loadClientAccessScope(staff.id);
  if (scope.kind === "organisation") return scope.organisationId === organisationId;
  return false;
}

/**
 * Returns client IDs this staff member may load or mutate. Never use raw `clientId`
 * from the client without intersecting with this list.
 *
 * This reads every live client in the organisation the staff member is
 * working in. Use it ONLY when the caller genuinely
 * needs the whole list (a clients index, a cross-client report). To answer
 * "may this staff member touch THIS one client?", call `canAccessClient` /
 * `requireClientAccess` instead — they ask the database about one indexed row
 * rather than dragging the table back to compare in JavaScript.
 */
export async function getAccessibleClientIds(
  staff: StaffIdentity,
): Promise<string[]> {
  const scope = await loadClientAccessScope(staff.id);
  if (scope.kind === "none") return [];
  const rows = await prisma.client.findMany({
    where: accessibleClientWhere(scope),
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
  const scope = await loadClientAccessScope(staff.id);
  if (scope.kind === "none") return false;
  const row = await prisma.client.findFirst({
    where: { ...accessibleClientWhere(scope), id: clientId },
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
