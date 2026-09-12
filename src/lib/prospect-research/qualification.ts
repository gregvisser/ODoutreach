import { z } from "zod";

const terms = z.array(z.string().trim().min(2).max(120)).min(1).max(20);
/** Each field is explicit: missing targeting must never become match-everyone. */
export const researchCriteriaSchema = z.object({
  titles: terms,
  industries: terms,
  seniorities: terms,
  regions: terms,
}).strict();
export const researchPlanSchema = z.object({
  name: z.string().trim().min(3).max(120),
  criteria: researchCriteriaSchema,
  maxLookups: z.number().int().min(1).max(100),
}).strict();
export type ResearchCriteria = z.infer<typeof researchCriteriaSchema>;
export type ResearchCandidateEvidence = Partial<Record<keyof ResearchCriteria, string>>;
export type QualificationDecision = {
  status: "MATCH" | "NO_MATCH" | "REVIEW" | "BLOCKED";
  reasons: string[];
  rulesVersion: "explicit-fit-v1";
};
const normalise = (value: string) => value.normalize("NFKC").toLocaleLowerCase("en-GB").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Text fit is evidence for staff review, never approval to import or send. */
export function qualifyResearchCandidate(
  criteria: ResearchCriteria,
  evidence: ResearchCandidateEvidence,
  suppression: "CLEAR" | "BLOCKED" | "REVIEW" | "UNVERIFIED",
): QualificationDecision {
  const result = (status: QualificationDecision["status"], reasons: string[]): QualificationDecision => ({ status, reasons, rulesVersion: "explicit-fit-v1" });
  if (suppression === "BLOCKED") return result("BLOCKED", ["Current do-not-contact or suppression check blocks this candidate."]);
  if (suppression !== "CLEAR") return result("REVIEW", ["Current suppression checks need verification or staff review."]);
  if (!researchCriteriaSchema.safeParse(criteria).success) return result("REVIEW", ["Targeting criteria are incomplete or invalid."]);
  const missing: string[] = [];
  const mismatched: string[] = [];
  for (const key of Object.keys(criteria) as (keyof ResearchCriteria)[]) {
    const actual = normalise(evidence[key] ?? "");
    if (!actual) { missing.push(key); continue; }
    // Phrase boundaries avoid e.g. matching "IT" inside "hospitality".
    if (!criteria[key].some(term => {
      const expected = normalise(term);
      return expected.length > 0 && ` ${actual} `.includes(` ${expected} `);
    })) mismatched.push(key);
  }
  if (mismatched.length) return result("NO_MATCH", mismatched.map(key => `No explicit ${key} match in the available evidence.`));
  if (missing.length) return result("REVIEW", missing.map(key => `Missing ${key} evidence.`));
  return result("MATCH", ["All four targeting fields have explicit matching evidence. Recheck suppression before accepting into a list."]);
}
