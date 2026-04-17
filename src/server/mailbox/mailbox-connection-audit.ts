import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

export async function auditMailboxConnectionChange(input: {
  staffUserId: string | null;
  clientId: string;
  mailboxId: string;
  metadata: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      staffUserId: input.staffUserId,
      clientId: input.clientId,
      action: "UPDATE",
      entityType: "ClientMailboxIdentity",
      entityId: input.mailboxId,
      metadata: input.metadata,
    },
  });
}
