import "server-only";
import { isStaffEmailAllowed } from "@/lib/staff-email-policy";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/normalize";
import type { StaffRole } from "@/generated/prisma/enums";
import type { StaffUser } from "@/generated/prisma/client";

/**
 * Loads the StaffUser for the current Entra session: match by `entraObjectId` (oid), or by
 * the recorded guest identity. Email can bind only a pending legacy invitation
 * without a recorded Graph identity, and that first-login binding is atomic.
 * Does not create rows — unknown Microsoft identities stay unauthorized.
 */
async function loadStaffRecord(): Promise<StaffUser | null> {
  const session = await auth();
  const entraObjectId = session?.user?.id;
  if (!entraObjectId) return null;

  const rawEmail = session?.user?.email;
  const email = rawEmail ? normalizeEmail(rawEmail) : "";
  const displayName = session?.user?.name ?? null;

  return prisma.$transaction(async (tx) => {
    const byOid = await tx.staffUser.findUnique({
      where: { entraObjectId },
    });
    if (byOid) {
      if (email && byOid.email !== email) {
        return tx.staffUser.update({
          where: { id: byOid.id },
          data: { email, displayName: displayName ?? byOid.displayName },
        });
      }
      if (displayName !== undefined && displayName !== byOid.displayName) {
        return tx.staffUser.update({
          where: { id: byOid.id },
          data: { displayName },
        });
      }
      return byOid;
    }

    const byInvitedGuestObjectId = await tx.staffUser.findFirst({
      where: { graphInvitedUserObjectId: entraObjectId },
    });
    if (byInvitedGuestObjectId) {
      // A recorded guest identity may sign in without replacing the owner's
      // separately provisioned primary Microsoft identity.
      if (byInvitedGuestObjectId.isSuperAdmin) return byInvitedGuestObjectId;
      return tx.staffUser.update({
        where: { id: byInvitedGuestObjectId.id, isSuperAdmin: false },
        data: {
          entraObjectId,
          displayName: displayName ?? byInvitedGuestObjectId.displayName,
          ...(byInvitedGuestObjectId.guestInvitationState === "PENDING"
            ? { guestInvitationState: "ACCEPTED" as const }
            : {}),
        },
      });
    }

    if (!email) return null;

    const byEmail = await tx.staffUser.findUnique({ where: { email } });
    if (!byEmail) return null;
    // Owner identities must be provisioned explicitly. An email match must
    // never transfer owner privileges to a different Microsoft identity.
    if (byEmail.isSuperAdmin) return null;
    if (byEmail.guestInvitationState !== "PENDING" || byEmail.graphInvitedUserObjectId) {
      return null;
    }

    // Recheck eligibility in the write: concurrent first logins must not both
    // acquire the same staff account, or replace the winner after its commit.
    await tx.staffUser.updateMany({
      where: {
        id: byEmail.id,
        entraObjectId: byEmail.entraObjectId,
        isSuperAdmin: false,
        guestInvitationState: "PENDING",
        graphInvitedUserObjectId: null,
      },
      data: {
        entraObjectId,
        displayName: displayName ?? byEmail.displayName,
        email,
        guestInvitationState: "ACCEPTED",
      },
    });
    const bound = await tx.staffUser.findUnique({ where: { id: byEmail.id } });
    return bound?.entraObjectId === entraObjectId && !bound.isSuperAdmin ? bound : null;
  });
}

export type StaffGateResult =
  | { status: "ok"; staff: StaffUser }
  | { status: "not_registered"; sessionEmail?: string | null }
  | { status: "inactive"; email: string }
  | { status: "domain_blocked"; staff: StaffUser };

/**
 * Full staff gate for the app shell: registered, active, and domain allowlist (when configured).
 */
export async function gateStaffAccess(): Promise<StaffGateResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { status: "not_registered" };
  }

  const staff = await loadStaffRecord();
  if (!staff) {
    return {
      status: "not_registered",
      sessionEmail: session.user?.email,
    };
  }
  if (!staff.isActive) {
    return { status: "inactive", email: staff.email };
  }
  if (!isStaffEmailAllowed(staff)) {
    return { status: "domain_blocked", staff };
  }
  return { status: "ok", staff };
}

/**
 * Optional env `STAFF_EMAIL_DOMAINS` — comma-separated domains (e.g. `opensdoors.co.uk` or
 * `@opensdoors.co.uk`). When set, only matching staff emails may use the app UI.
 * Empty = no domain filter (convenient for quick local UI work; set real domains for Entra tests).
 */
export { isStaffEmailAllowed } from "@/lib/staff-email-policy";

/**
 * Staff row must exist (or link by pre-provisioned email) and be active.
 * The configured email-domain policy applies to every entry point.
 */
export async function requireStaffUser(): Promise<StaffUser> {
  const staff = await loadStaffRecord();
  if (!staff) {
    throw new Error("Unauthorized");
  }
  if (!staff.isActive) {
    throw new Error("STAFF_INACTIVE");
  }
  if (!isStaffEmailAllowed(staff)) {
    throw new Error("STAFF_EMAIL_NOT_ALLOWED");
  }
  return staff;
}

/**
 * Enforce OpensDoors staff policy: registered active staff + domain allowlist when configured.
 * MFA is enforced by Microsoft Entra policies for the tenant, not in this app.
 */
export async function requireOpensDoorsStaff(): Promise<StaffUser> {
  const staff = await requireStaffUser();
  if (!isStaffEmailAllowed(staff)) {
    throw new Error("STAFF_EMAIL_NOT_ALLOWED");
  }
  return staff;
}

/**
 * Best-effort staff row for the current session (e.g. mailbox OAuth callback when the
 * Microsoft/Google account completing redirect may not be an ODoutreach operator).
 * Does not throw; returns null when unauthenticated or not an active allowed staff user.
 */
export async function tryGetOpensDoorsStaff(): Promise<StaffUser | null> {
  try {
    return await requireOpensDoorsStaff();
  } catch {
    return null;
  }
}

/** Admin-only operations (staff management). Does not bypass Entra or StaffUser checks. */
export async function requireStaffAdmin(): Promise<StaffUser> {
  const staff = await requireOpensDoorsStaff();
  if (staff.role !== "ADMIN") {
    throw new Error("ADMIN_ONLY");
  }
  return staff;
}

/**
 * Same as {@link requireStaffAdmin} but maps any failure to a single message (server actions / APIs).
 */
export async function requireStaffAdminForAction(): Promise<StaffUser> {
  try {
    return await requireStaffAdmin();
  } catch {
    throw new Error("You do not have permission to manage staff.");
  }
}

export async function getStaffRole(): Promise<StaffRole | null> {
  const staff = await loadStaffRecord();
  return staff?.role ?? null;
}

/**
 * F2 — super-admin gate for destructive workspace operations (soft-delete,
 * restore, hard purge). Builds on the full OpensDoors staff gate, then
 * additionally requires the per-account `isSuperAdmin` capability. This is
 * NOT role-based and NOT email-based, so it cannot be reached by escalating a
 * role or spoofing an address.
 */
export async function requireSuperAdmin(): Promise<StaffUser> {
  const staff = await requireOpensDoorsStaff();
  if (!staff.isSuperAdmin) {
    throw new Error("SUPER_ADMIN_ONLY");
  }
  return staff;
}

/**
 * Same as {@link requireSuperAdmin} but collapses every failure to a single
 * user-facing message — use from server actions / API routes.
 */
export async function requireSuperAdminForAction(): Promise<StaffUser> {
  try {
    return await requireSuperAdmin();
  } catch {
    throw new Error("You do not have permission to delete workspaces.");
  }
}
