import "server-only";

import type { StaffUser } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { mailboxMutatorAllowedFromRoles } from "@/lib/mailbox-mutator-policy";
import { getAccessibleClientIds } from "@/server/tenant/access";

/**
 * PR D4b — who can author / approve client email sequences?
 *
 * We reuse the mailbox-mutator predicate (same matrix as template
 * mutation access in PR D4a) so the permission model stays consistent
 * across the outreach workspace:
 *   - global ADMIN / MANAGER: always allowed
 *   - global OPERATOR: allowed when client membership is LEAD or
 *     CONTRIBUTOR
 *   - global VIEWER: never allowed
 *   - client-level VIEWER membership: never allowed
 *
 * Approval is not ADMIN-only today — the product rule is "approved by
 * OpensDoors staff" and a tighter constraint can land later without a
 * migration.
 */
export async function getClientEmailSequenceMutationAllowed(
  staff: Pick<StaffUser, "id" | "role">,
  clientId: string,
): Promise<boolean> {
  const allowed = await getAccessibleClientIds(staff);
  if (!allowed.includes(clientId)) return false;

  const membership = await prisma.clientMembership.findUnique({
    where: { staffUserId_clientId: { staffUserId: staff.id, clientId } },
    select: { role: true },
  });

  return mailboxMutatorAllowedFromRoles(staff.role, membership?.role ?? null);
}

export async function requireClientEmailSequenceMutator(
  staff: Pick<StaffUser, "id" | "role">,
  clientId: string,
): Promise<void> {
  const ok = await getClientEmailSequenceMutationAllowed(staff, clientId);
  if (!ok) {
    throw new Error(
      "You do not have permission to manage email sequences for this client.",
    );
  }
}
