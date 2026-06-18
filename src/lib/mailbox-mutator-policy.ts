import type { ClientMemberRole, StaffRole } from "@/generated/prisma/enums";

/**
 * In-account roles were removed (2026-06): any active staff member may mutate
 * mailboxes / templates / sequences on any client they can access. Access
 * itself (which clients) is still enforced separately by `getAccessibleClientIds`
 * in the async wrappers, so this predicate only governs the now-removed role
 * dimension and always allows. Kept as a stable seam (and to keep call sites +
 * tests intact) rather than deleted outright.
 */
export function mailboxMutatorAllowedFromRoles(
  staffRole: StaffRole,
  clientMemberRole: ClientMemberRole | null,
): boolean {
  void staffRole;
  void clientMemberRole;
  return true;
}
