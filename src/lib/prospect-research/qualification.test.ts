import { expect, it } from "vitest";
import { qualifyResearchCandidate, researchPlanSchema, type ResearchCriteria } from "./qualification";
const criteria: ResearchCriteria = { titles: ["IT director"], industries: ["Manufacturing"], seniorities: ["Director"], regions: ["United Kingdom"] };
const evidence = { titles: "Group IT Director", industries: "Manufacturing", seniorities: "Director", regions: "United Kingdom" };
it("records explicit field matches without making a sending decision", () => {
  expect(qualifyResearchCandidate(criteria, evidence, "CLEAR")).toMatchObject({ status: "MATCH", rulesVersion: "explicit-fit-v1" });
});
it.each(["REVIEW", "UNVERIFIED"] as const)("cannot qualify when suppression is %s", suppression => {
  expect(qualifyResearchCandidate(criteria, evidence, suppression).status).toBe("REVIEW");
});
it("keeps blocked candidates blocked regardless of fit", () => {
  expect(qualifyResearchCandidate(criteria, {}, "BLOCKED").status).toBe("BLOCKED");
});
it("requires missing evidence rather than guessing", () => {
  expect(qualifyResearchCandidate(criteria, { ...evidence, regions: undefined }, "CLEAR")).toMatchObject({ status: "REVIEW", reasons: ["Missing regions evidence."] });
});
it("does not infer regional aliases or seniority", () => {
  expect(qualifyResearchCandidate(criteria, { ...evidence, regions: "UK" }, "CLEAR").status).toBe("NO_MATCH");
});
it("does not match a term inside another word", () => {
  expect(qualifyResearchCandidate({ ...criteria, titles: ["IT"] }, { ...evidence, titles: "Hospitality manager" }, "CLEAR").status).toBe("NO_MATCH");
});
it("refuses empty targeting and budgets that cannot bound work", () => {
  expect(qualifyResearchCandidate({ ...criteria, regions: [] }, evidence, "CLEAR").status).toBe("REVIEW");
  for (const maxLookups of [0, 1.5, 101, Infinity]) expect(researchPlanSchema.safeParse({ name: "Synthetic plan", criteria, maxLookups }).success).toBe(false);
});
it("normalises case, spacing and punctuation in explicit phrases", () => {
  expect(qualifyResearchCandidate(criteria, { ...evidence, titles: "GROUP it-director" }, "CLEAR").status).toBe("MATCH");
});
