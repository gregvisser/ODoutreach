import "server-only";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/normalize";
import type { StaffRole } from "@/generated/prisma/enums";
import type { StaffUser } from "@/generated/prisma/client";

/**
 * Loads the StaffUser for the current Entra session: match by `entraObjectId` (oid), or by
 * normalized email then persist `entraObjectId` on first login (pre-provisioned row only).
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

    if (!email) return null;

    const byEmail = await tx.staffUser.findUnique({ where: { email } });
    if (!byEmail) return null;

    return tx.staffUser.update({
      where: { id: byEmail.id },
      data: {
        entraObjectId,
        displayName: displayName ?? byEmail.displayName,
        email,
        ...(byEmail.guestInvitationState === "PENDING"
          ? { guestInvitationState: "ACCEPTED" as const }
          : {}),
      },
    });
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
export function isStaffEmailAllowed(staff: Pick<StaffUser, "email">): boolean {
  const raw = process.env.STAFF_EMAIL_DOMAINS?.trim();
  if (!raw) return true;

  const domains = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const email = staff.email.toLowerCase();

  return domains.some((d) => {
    if (d.startsWith("@")) return email.endsWith(d);
    if (d.includes("@")) return email === d;
    return email.endsWith(`@${d}`);
  });
}

/**
 * Staff row must exist (or link by pre-provisioned email) and be active.
 * Domain policy is enforced in `requireOpensDoorsStaff` / `gateStaffAccess`, not here.
 */
export async function requireStaffUser(): Promise<StaffUser> {
  const staff = await loadStaffRecord();
  if (!staff) {
    throw new Error("Unauthorized");
  }
  if (!staff.isActive) {
    throw new Error("STAFF_INACTIVE");
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
