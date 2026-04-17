import type { StaffRole } from "@/generated/prisma/enums";

/**
 * Pure policy helpers for {@link assertLastActiveAdminProtected} — unit-tested without DB.
 */
export function assertNotSelfDeactivationFromStaffScreen(input: {
  actorStaffUserId: string;
  targetStaffUserId: string;
  nextActive?: boolean;
}): void {
  const { actorStaffUserId, targetStaffUserId, nextActive } = input;
  if (nextActive === false && targetStaffUserId === actorStaffUserId) {
    throw new Error("You cannot deactivate your own account from this screen.");
  }
}

export function isLastActiveAdminRemovalAttempt(
  target: { role: StaffRole; isActive: boolean },
  nextRole?: StaffRole,
  nextActive?: boolean,
): boolean {
  const demotingActiveAdmin =
    nextRole !== undefined &&
    target.role === "ADMIN" &&
    target.isActive &&
    nextRole !== "ADMIN";

  const deactivatingActiveAdmin =
    nextActive === false && target.role === "ADMIN" && target.isActive;

  return demotingActiveAdmin || deactivatingActiveAdmin;
}

export function assertAtLeastOneOtherActiveAdmin(activeAdminCount: number): void {
  if (activeAdminCount <= 1) {
    throw new Error(
      "Cannot change the last active administrator. Promote another admin first.",
    );
  }
}
