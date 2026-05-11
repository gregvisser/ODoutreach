import "server-only";

import type { StaffUser } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { mailboxMutatorAllowedFromRoles } from "@/lib/mailbox-mutator-policy";
import { getAccessibleClientIds } from "@/server/tenant/access";

/**
 * PR D4a — who can author / approve client email templates?
 *
 * We reuse the mailbox-mutator predicate so the matrix stays consistent
 * with other OpensDoors content-mutation flows:
 *   - global ADMIN / MANAGER: always allowed
 *   - global OPERATOR: allowed when client membership is LEAD or CONTRIBUTOR
 *   - global VIEWER: never allowed
 *   - client-level VIEWER membership: never allowed
 *
 * Approval is not gated to ADMIN only for PR D4a — the product spec says
 * "approved by OpensDoors staff", and a tighter "ADMIN only to approve"
 * constraint can land in PR D4b without a migration.
 */
export async function getClientEmailTemplateMutationAllowed(
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

export async function requireClientEmailTemplateMutator(
  staff: Pick<StaffUser, "id" | "role">,
  clientId: string,
): Promise<void> {
  const ok = await getClientEmailTemplateMutationAllowed(staff, clientId);
  if (!ok) {
    throw new Error(
      "You do not have permission to manage email templates for this client.",
    );
  }
}
