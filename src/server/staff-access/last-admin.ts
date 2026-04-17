import "server-only";

import { prisma } from "@/lib/db";
import type { StaffRole } from "@/generated/prisma/enums";

import {
  assertAtLeastOneOtherActiveAdmin,
  assertNotSelfDeactivationFromStaffScreen,
  isLastActiveAdminRemovalAttempt,
} from "./last-admin-policy";

/**
 * Prevents removing the last active ADMIN (role change or deactivation).
 * Also blocks self-deactivation to avoid accidental lockout.
 */
export async function assertLastActiveAdminProtected(input: {
  actorStaffUserId: string;
  targetStaffUserId: string;
  nextRole?: StaffRole;
  nextActive?: boolean;
}): Promise<void> {
  const { actorStaffUserId, targetStaffUserId, nextRole, nextActive } = input;

  assertNotSelfDeactivationFromStaffScreen({
    actorStaffUserId,
    targetStaffUserId,
    nextActive,
  });

  const target = await prisma.staffUser.findUnique({
    where: { id: targetStaffUserId },
    select: { role: true, isActive: true },
  });
  if (!target) throw new Error("Staff user not found.");

  if (!isLastActiveAdminRemovalAttempt(target, nextRole, nextActive)) return;

  const activeAdminCount = await prisma.staffUser.count({
    where: { role: "ADMIN", isActive: true },
  });

  assertAtLeastOneOtherActiveAdmin(activeAdminCount);
}
