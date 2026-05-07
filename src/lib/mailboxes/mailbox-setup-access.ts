import { isOpensDoorsSuperadminStaff } from "@/lib/staff/opensdoors-superadmin";

/** Internal proof send, signature editors, and advanced diagnostics — platform super-admin only. */
export function canAccessMailboxSetupTools(staff: { email: string }): boolean {
  return isOpensDoorsSuperadminStaff(staff);
}
