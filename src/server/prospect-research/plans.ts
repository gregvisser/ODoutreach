import "server-only";
import { prisma } from "@/lib/db";
import { researchPlanSchema } from "@/lib/prospect-research/qualification";
import { requireClientAccess } from "@/server/tenant/access";
import type { StaffIdentity } from "@/server/tenant/access";

export async function saveResearchPlan(staff: StaffIdentity, clientId: string, input: unknown) {
  await requireClientAccess(staff, clientId);
  const plan = researchPlanSchema.parse(input);
  return prisma.$transaction(async tx => {
    // Recheck at write time: deleted workspaces must not receive new plans.
    const client = await tx.client.findFirst({ where: { id: clientId, deletedAt: null }, select: { id: true } });
    if (!client) throw new Error("FORBIDDEN_CLIENT");
    const saved = await tx.prospectResearchPlan.create({ data: { ...plan, clientId, createdByStaffId: staff.id } });
    await tx.auditLog.create({ data: { clientId, staffUserId: staff.id, action: "CREATE", entityType: "ProspectResearchPlan", entityId: saved.id, metadata: { state: "DRAFT", maxLookups: plan.maxLookups, rulesVersion: "explicit-fit-v1", providerCallsAuthorised: false } } });
    return saved;
  });
}

export async function listResearchPlans(staff: StaffIdentity, clientId: string) {
  await requireClientAccess(staff, clientId);
  return prisma.prospectResearchPlan.findMany({ where: { clientId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20 });
}

