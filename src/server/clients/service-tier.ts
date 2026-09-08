import "server-only";
import { prisma } from "@/lib/db";
import { isStaffEmailAllowed } from "@/lib/staff-email-policy";
import type { ServiceTier, ServiceTierSnapshot } from "@/lib/clients/service-tier";

export async function setClientServiceTier(input: { clientId: string; staffUserId: string; tier: ServiceTier; expectedRevision: number }) {
  try {
    return await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "StaffUser" WHERE id = ${input.staffUserId} FOR SHARE`;
      const staff = await tx.staffUser.findUnique({ where: { id: input.staffUserId } });
      if (!staff?.isActive || !isStaffEmailAllowed(staff)) return { ok: false as const, error: "Your staff access has changed. Sign in again." };
      await tx.$queryRaw`SELECT id FROM "Client" WHERE id = ${input.clientId} FOR UPDATE`;
      const client = await tx.client.findFirst({ where: { id: input.clientId, deletedAt: null } });
      if (!client) return { ok: false as const, error: "This client is unavailable." };
      if (client.serviceTierRevision !== input.expectedRevision) return { ok: false as const, error: "Someone has changed this grade. Refresh and review the latest choice." };
      const now = new Date();
      await tx.client.update({ where: { id: client.id }, data: { serviceTier: input.tier, serviceTierSetByStaffUserId: staff.id, serviceTierSetAt: now, serviceTierRevision: { increment: 1 } } });
      await tx.auditLog.create({ data: { clientId: client.id, staffUserId: staff.id, action: "UPDATE", entityType: "Client", entityId: client.id,
        metadata: { kind: "customer_service_tier_set", previousTier: client.serviceTier, tier: input.tier },
      } });
      const snapshot: ServiceTierSnapshot = { tier: input.tier, revision: client.serviceTierRevision + 1, setAt: now.toISOString(), setByName: staff.displayName ?? staff.email };
      return { ok: true as const, snapshot };
    });
  } catch {
    return { ok: false as const, uncertain: true as const, error: "We could not confirm the grade change. Refresh this page before trying again." };
  }
}
