import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isValidEmailFormat } from "@/lib/normalize";
import { qualifyResearchCandidate, researchCriteriaSchema, type QualificationDecision } from "@/lib/prospect-research/qualification";
import { evaluateSuppression } from "@/server/outreach/suppression-guard";
import { requireClientAccess, type StaffIdentity } from "@/server/tenant/access";
const snapshotSchema = z.object({ status: z.enum(["MATCH", "NO_MATCH", "REVIEW", "BLOCKED"]), reasons: z.array(z.string()), rulesVersion: z.string() });
const evidenceSchema = z.object({ titles: z.string().optional(), industries: z.string().optional(), seniorities: z.string().optional(), regions: z.string().optional() });
export async function loadResearchCandidateReview(staff: StaffIdentity, clientId: string, page: number) {
  await requireClientAccess(staff, clientId);
  if (!Number.isSafeInteger(page) || page < 0 || page > 10000) throw Error("INVALID_PAGE");
  const rows = await prisma.prospectResearchCandidate.findMany({
    where: { request: { run: { plan: { clientId } } } },
    include: { request: { include: { run: { include: { plan: true } } } } },
    orderBy: [{ evaluatedAt: "desc" }, { id: "desc" }], skip: page * 20, take: 21,
  });
  const candidates = await Promise.all(rows.slice(0, 20).map(async candidate => {
    const original = snapshotSchema.safeParse(candidate.decision);
    const evidence = evidenceSchema.safeParse(candidate.evidence);
    const criteria = researchCriteriaSchema.safeParse(candidate.request.run.plan.criteria);
    let current: QualificationDecision = { status: "REVIEW", reasons: ["Evidence or email is incomplete. Staff review is required."], rulesVersion: "explicit-fit-v1" };
    if (candidate.email && isValidEmailFormat(candidate.email) && evidence.success && criteria.success) {
      const suppression = await evaluateSuppression(clientId, candidate.email, candidate.company);
      current = qualifyResearchCandidate(criteria.data, evidence.data, suppression.suppressed ? suppression.reason === "company_review" ? "REVIEW" : "BLOCKED" : "CLEAR");
    }
    return { id: candidate.id, email: candidate.email, company: candidate.company,
      planName: candidate.request.run.plan.name, evaluatedAt: candidate.evaluatedAt.toISOString(),
      evidence: evidence.success ? evidence.data : {},
      original: original.success ? original.data : { status: "REVIEW", reasons: ["Original decision is unavailable."], rulesVersion: "unknown" }, current };
  }));
  return { candidates, hasNext: rows.length > 20 };
}
