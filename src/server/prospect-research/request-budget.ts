import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireClientAccess, type StaffIdentity } from "@/server/tenant/access";

/** Internal service only: no UI or worker enables paid execution in this slice. */
export async function approveResearchRun(staff: StaffIdentity, clientId: string, planId: string) {
  await requireClientAccess(staff, clientId);
  return prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT p.id FROM "ProspectResearchPlan" p JOIN "Client" c ON c.id=p."clientId"
      WHERE p.id=${planId} AND c.id=${clientId} AND c."deletedAt" IS NULL FOR UPDATE OF p, c`;
    if (!rows.length) throw Error("RESEARCH_PLAN_UNAVAILABLE");
    const existing = await tx.prospectResearchRun.findUnique({ where: { planId } });
    if (existing) return existing; // Repeat approval never renews a budget or resumes a pause.
    const plan = await tx.prospectResearchPlan.findUniqueOrThrow({ where: { id: planId } });
    const run = await tx.prospectResearchRun.create({ data: { planId, maxLookups: plan.maxLookups, approvedByStaffId: staff.id } });
    await tx.auditLog.create({ data: { clientId, staffUserId: staff.id, action: "CREATE", entityType: "ProspectResearchRun", entityId: run.id, metadata: { planId, maxLookups: run.maxLookups, maxSearchRequests: 1 } } });
    return run;
  });
}

const requestSchema = z.object({ clientId: z.string().min(1), runId: z.string().min(1), requestKey: z.string().trim().min(1).max(160), kind: z.enum(["SEARCH", "LOOKUP"]) });
export async function reserveResearchRequest(input: z.infer<typeof requestSchema>) {
  const value = requestSchema.parse(input);
  return prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT r.id FROM "ProspectResearchRun" r
      JOIN "ProspectResearchPlan" p ON p.id=r."planId" JOIN "Client" c ON c.id=p."clientId"
      WHERE r.id=${value.runId} AND c.id=${value.clientId} AND c."deletedAt" IS NULL FOR UPDATE OF r, c`;
    if (!rows.length) return { acquired: false, reason: "UNAVAILABLE" } as const;
    const run = await tx.prospectResearchRun.findUniqueOrThrow({ where: { id: value.runId } });
    if (run.pausedAt) return { acquired: false, reason: "PAUSED" } as const;
    if (await tx.prospectResearchRequest.findUnique({ where: { runId_requestKey: { runId: run.id, requestKey: value.requestKey } } })) return { acquired: false, reason: "ALREADY_RESERVED" } as const;
    const used = await tx.prospectResearchRequest.count({ where: { runId: run.id, kind: value.kind } });
    const limit = value.kind === "SEARCH" ? 1 : run.maxLookups;
    if (used >= limit) return { acquired: false, reason: "BUDGET_EXHAUSTED" } as const;
    const request = await tx.prospectResearchRequest.create({ data: { runId: run.id, requestKey: value.requestKey, kind: value.kind } });
    return { acquired: true, requestId: request.id } as const;
  });
}

export async function pauseResearchRun(staff: StaffIdentity, clientId: string, runId: string) {
  await requireClientAccess(staff, clientId);
  return prisma.$transaction(async tx => {
    const updated = await tx.prospectResearchRun.updateMany({ where: { id: runId, plan: { clientId }, pausedAt: null }, data: { pausedAt: new Date() } });
    if (updated.count) await tx.auditLog.create({ data: { clientId, staffUserId: staff.id, action: "UPDATE", entityType: "ProspectResearchRun", entityId: runId, metadata: { paused: true } } });
    return updated.count;
  });
}
