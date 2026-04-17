import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { AuditAction } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";

/** Operational trail for Settings → Staff Access (no PII beyond emails already in metadata). */
export async function logStaffAccessAudit(input: {
  actorStaffUserId: string;
  action: AuditAction;
  targetStaffUserId: string | null;
  metadata: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      staffUserId: input.actorStaffUserId,
      clientId: null,
      action: input.action,
      entityType: "StaffUser",
      entityId: input.targetStaffUserId,
      metadata: input.metadata,
    },
  });
}
