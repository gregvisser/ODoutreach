import type { StaffRole } from "@/generated/prisma/enums";

/** Internal proof send, signature editors, and advanced diagnostics. */
export function canAccessMailboxSetupTools(role: StaffRole): boolean {
  return role === "ADMIN" || role === "MANAGER";
}
