import type { ClientMemberRole, StaffRole } from "@/generated/prisma/enums";

/** Pure predicate — async wrapper loads membership in {@link getClientMailboxMutationAllowed}. */
export function mailboxMutatorAllowedFromRoles(
  staffRole: StaffRole,
  clientMemberRole: ClientMemberRole | null,
): boolean {
  if (staffRole === "VIEWER") return false;
  if (staffRole === "ADMIN" || staffRole === "MANAGER") return true;
  return clientMemberRole === "LEAD" || clientMemberRole === "CONTRIBUTOR";
}
