import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { ClientAccessScope } from "@/server/tenant/access";

/**
 * Support tickets one staff scope may list. The organisation they are
 * working in, and nothing else. No organisation sees nothing.
 */
export function supportTicketWhere(
  scope: ClientAccessScope,
): Prisma.SupportTicketWhereInput {
  if (scope.kind === "organisation") return { organisationId: scope.organisationId };
  return { id: { in: [] } };
}
