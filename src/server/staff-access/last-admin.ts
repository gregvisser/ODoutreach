import "server-only";

import { prisma } from "@/lib/db";
import type { StaffRole } from "@/generated/prisma/enums";

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

  if (nextActive === false && targetStaffUserId === actorStaffUserId) {
    throw new Error("You cannot deactivate your own account from this screen.");
  }

  const target = await prisma.staffUser.findUnique({
    where: { id: targetStaffUserId },
    select: { role: true, isActive: true },
  });
  if (!target) throw new Error("Staff user not found.");

  const demotingActiveAdmin =
    nextRole !== undefined &&
    target.role === "ADMIN" &&
    target.isActive &&
    nextRole !== "ADMIN";

  const deactivatingActiveAdmin =
    nextActive === false && target.role === "ADMIN" && target.isActive;

  if (!demotingActiveAdmin && !deactivatingActiveAdmin) return;

  const activeAdminCount = await prisma.staffUser.count({
    where: { role: "ADMIN", isActive: true },
  });

  if (activeAdminCount <= 1) {
    throw new Error(
      "Cannot change the last active administrator. Promote another admin first.",
    );
  }
}
