/**
 * Single OpensDoors platform super-admin (workspace governance, staff access, launch approval).
 * Other users are operators for day-to-day client work even if a legacy DB role still says MANAGER.
 */

export const OPENS_DOORS_PLATFORM_SUPERADMIN_EMAIL = "greg@opensdoors.co.uk" as const;

export function normalizeStaffEmailForPolicy(email: string): string {
  return email.trim().toLowerCase();
}

export function isOpensDoorsSuperadminStaff(staff: { email: string }): boolean {
  return (
    normalizeStaffEmailForPolicy(staff.email) ===
    normalizeStaffEmailForPolicy(OPENS_DOORS_PLATFORM_SUPERADMIN_EMAIL)
  );
}

/** Team access, launch governance, mailbox proof/signature tools, global client list. */
export function canAccessWorkspaceAdminControls(staff: { email: string }): boolean {
  return isOpensDoorsSuperadminStaff(staff);
}
