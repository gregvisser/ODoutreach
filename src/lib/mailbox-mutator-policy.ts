import type { ClientMemberRole, StaffRole } from "@/generated/prisma/enums";

/**
 * Pure predicate — async wrapper loads membership in {@link getClientMailboxMutationAllowed}.
 *
 * OPERATOR is now a full operational role: operators can manage mailboxes,
 * templates, sequences, and sends on any client they can access (operators
 * have global client access — see tenant/access.ts), without needing a
 * per-client LEAD/CONTRIBUTOR membership. VIEWER remains read-only. The
 * client-member-role fallback is retained for any future non-global role.
 */
export function mailboxMutatorAllowedFromRoles(
  staffRole: StaffRole,
  clientMemberRole: ClientMemberRole | null,
): boolean {
  if (staffRole === "VIEWER") return false;
  if (staffRole === "ADMIN" || staffRole === "MANAGER" || staffRole === "OPERATOR") {
    return true;
  }
  return clientMemberRole === "LEAD" || clientMemberRole === "CONTRIBUTOR";
}
