import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { ClientAccessScope } from "@/server/tenant/access";

/**
 * Support tickets one staff scope may list. Platform admin sees every
 * organisation. An organisation member sees that organisation only.
 * No membership sees nothing.
 */
export function supportTicketWhere(
  scope: ClientAccessScope,
): Prisma.SupportTicketWhereInput {
  if (scope.kind === "all-live") return {};
  if (scope.kind === "organisation") return { organisationId: scope.organisationId };
  return { id: { in: [] } };
}
