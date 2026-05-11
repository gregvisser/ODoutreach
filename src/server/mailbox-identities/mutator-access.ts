import "server-only";

import type { StaffUser } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { mailboxMutatorAllowedFromRoles } from "@/lib/mailbox-mutator-policy";
import { getAccessibleClientIds } from "@/server/tenant/access";

export { mailboxMutatorAllowedFromRoles } from "@/lib/mailbox-mutator-policy";

/**
 * Staff may manage mailbox identities if they can access the client and:
 * - global ADMIN/MANAGER, or
 * - staff OPERATOR with client membership LEAD or CONTRIBUTOR.
 * Client-level VIEWER membership cannot mutate; staff VIEWER cannot mutate.
 */
export async function getClientMailboxMutationAllowed(
  staff: Pick<StaffUser, "id" | "role">,
  clientId: string,
): Promise<boolean> {
  const allowedClients = await getAccessibleClientIds(staff);
  if (!allowedClients.includes(clientId)) return false;

  const membership = await prisma.clientMembership.findUnique({
    where: {
      staffUserId_clientId: { staffUserId: staff.id, clientId },
    },
    select: { role: true },
  });

  return mailboxMutatorAllowedFromRoles(
    staff.role,
    membership?.role ?? null,
  );
}

export async function requireClientMailboxMutator(
  staff: Pick<StaffUser, "id" | "role">,
  clientId: string,
): Promise<void> {
  const ok = await getClientMailboxMutationAllowed(staff, clientId);
  if (!ok) {
    throw new Error("You do not have permission to manage mailbox identities for this client.");
  }
}
