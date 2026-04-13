import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";

import { prisma } from "@/lib/db";
import type { StaffRole } from "@/generated/prisma/enums";
import type { StaffUser } from "@/generated/prisma/client";

/**
 * Ensures a StaffUser row exists for the signed-in Clerk user (internal staff only).
 */
export async function requireStaffUser(): Promise<StaffUser> {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Unauthorized");
  }

  const user = await currentUser();
  const email =
    user?.emailAddresses?.[0]?.emailAddress ?? "unknown@opensdoors.local";

  const staff = await prisma.staffUser.upsert({
    where: { clerkUserId: userId },
    create: {
      clerkUserId: userId,
      email,
      displayName: user?.fullName ?? user?.firstName ?? null,
      role: "OPERATOR",
    },
    update: {
      email,
      displayName: user?.fullName ?? user?.firstName ?? null,
    },
  });

  return staff;
}

/**
 * Optional env `STAFF_EMAIL_DOMAINS` — comma-separated domains (e.g. `opensdoors.com` or `@opensdoors.com`).
 * When set, only matching staff emails may use the app UI. Empty = allow all (useful for local dev).
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
 * Use in server actions and data loaders that must enforce OpensDoors staff policy + MFA via Clerk session.
 * MFA enrollment is configured in Clerk Dashboard, not here.
 */
export async function requireOpensDoorsStaff(): Promise<StaffUser> {
  const staff = await requireStaffUser();
  if (!isStaffEmailAllowed(staff)) {
    throw new Error("STAFF_EMAIL_NOT_ALLOWED");
  }
  return staff;
}

export async function getStaffRole(): Promise<StaffRole | null> {
  const { userId } = await auth();
  if (!userId) return null;
  const row = await prisma.staffUser.findUnique({
    where: { clerkUserId: userId },
    select: { role: true },
  });
  return row?.role ?? null;
}
