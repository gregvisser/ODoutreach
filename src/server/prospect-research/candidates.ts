import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isValidEmailFormat, normalizeEmail } from "@/lib/normalize";
import { qualifyResearchCandidate, researchCriteriaSchema, type QualificationDecision } from "@/lib/prospect-research/qualification";
import { evaluateSuppression } from "@/server/outreach/suppression-guard";
import { requireClientAccess, type StaffIdentity } from "@/server/tenant/access";
const field = z.string().trim().max(500).optional();
const candidateSchema = z.object({
  clientId: z.string().min(1), requestId: z.string().min(1),
  providerProfileId: z.string().regex(/^[1-9][0-9]*$/).max(30),
  email: z.string().trim().max(320).optional(), company: field,
  evidence: z.object({ titles: field, industries: field, seniorities: field, regions: field }).strict(),
}).strict();

/** Saves one immutable evidence snapshot per reserved lookup, never a Contact. */
export async function stageResearchCandidate(input: z.infer<typeof candidateSchema>) {
  const value = candidateSchema.parse(input);
  const request = await prisma.prospectResearchRequest.findFirst({ where: {
    id: value.requestId, kind: "LOOKUP", requestKey: `lookup:${value.providerProfileId}`,
    run: { plan: { clientId: value.clientId, client: { deletedAt: null } } },
  }, include: { run: { include: { plan: true } } } });
  if (!request) throw Error("RESEARCH_REQUEST_UNAVAILABLE");
  const email = normalizeEmail(value.email ?? "");
  let decision: QualificationDecision;
  if (!email || !isValidEmailFormat(email)) {
    decision = { status: "REVIEW", reasons: ["No valid email address in the provider evidence."], rulesVersion: "explicit-fit-v1" };
  } else {
    const suppression = await evaluateSuppression(value.clientId, email, value.company);
    decision = qualifyResearchCandidate(researchCriteriaSchema.parse(request.run.plan.criteria), value.evidence,
      suppression.suppressed ? (suppression.reason === "company_review" ? "REVIEW" : "BLOCKED") : "CLEAR");
  }
  // Snapshot decisions expire conceptually at acceptance: an importer must recheck
  // current suppression rather than treating this historical MATCH as approval.
  return prisma.$transaction(async tx => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT q.id FROM "ProspectResearchRequest" q
      JOIN "ProspectResearchRun" r ON r.id=q."runId"
      JOIN "ProspectResearchPlan" p ON p.id=r."planId" JOIN "Client" c ON c.id=p."clientId"
      WHERE q.id=${request.id} AND c.id=${value.clientId} AND c."deletedAt" IS NULL FOR UPDATE OF q`;
    if (!locked.length) throw Error("RESEARCH_REQUEST_UNAVAILABLE");
    const existing = await tx.prospectResearchCandidate.findUnique({ where: { requestId: request.id } });
    if (existing) return existing; // Retry cannot replace the original evidence or decision.
    const saved = await tx.prospectResearchCandidate.create({ data: {
      requestId: request.id, providerProfileId: value.providerProfileId,
      email: email || null, company: value.company || null, evidence: value.evidence, decision,
    } });
    await tx.auditLog.create({ data: { clientId: value.clientId, action: "CREATE", entityType: "ProspectResearchCandidate", entityId: saved.id, metadata: { runId: request.runId, requestId: request.id, status: decision.status, rulesVersion: decision.rulesVersion } } });
    return saved;
  });
}

export async function listResearchCandidates(staff: StaffIdentity, clientId: string, runId: string) {
  await requireClientAccess(staff, clientId);
  return prisma.prospectResearchCandidate.findMany({ where: { request: { runId, run: { plan: { clientId } } } }, orderBy: [{ evaluatedAt: "desc" }, { id: "desc" }], take: 100 });
}
