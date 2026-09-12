import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetIntegrationDatabase, closeIntegrationPool } from "@/test/integration/database";
import { loadResearchCandidateReview } from "./review";
const staff = { id: "review-staff", role: "OPERATOR" as const };
const criteria = { titles: ["Director"], industries: ["Manufacturing"], seniorities: ["Director"], regions: ["UK"] };
const evidence = { titles: "Director", industries: "Manufacturing", seniorities: "Director", regions: "UK" };
beforeEach(async () => {
  await resetIntegrationDatabase(); vi.stubEnv("INTERNAL_SEED_ALLOWLIST_ENABLED", "false"); vi.stubGlobal("fetch", vi.fn());
  await prisma.client.createMany({ data: [{ id: "review-client", name: "Synthetic", slug: "review-client" }, { id: "other", name: "Other", slug: "other" }] });
  await prisma.prospectResearchPlan.create({ data: { id: "plan", clientId: "review-client", name: "Synthetic", criteria, maxLookups: 30, createdByStaffId: staff.id, run: { create: { id: "run", maxLookups: 30, approvedByStaffId: staff.id } } } });
  for (let i = 0; i < 21; i++) await prisma.prospectResearchRequest.create({ data: { id: `request-${i}`, runId: "run", requestKey: `lookup:${i + 1}`, kind: "LOOKUP", candidate: { create: { id: `candidate-${String(i).padStart(2, "0")}`, providerProfileId: String(i + 1), email: `person${i}@example.test`, company: "Synthetic", evidence, evaluatedAt: new Date("2026-01-01"), decision: { status: "MATCH", reasons: ["Original match"], rulesVersion: "explicit-fit-v1" } } } } });
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
afterAll(async () => { await prisma.$disconnect(); await closeIntegrationPool(); });
it("shows a new block separately from the original match without changing history", async () => {
  await prisma.suppressedEmail.create({ data: { clientId: "review-client", email: "person20@example.test" } });
  const data = await loadResearchCandidateReview(staff, "review-client", 0);
  expect(data.candidates[0]).toMatchObject({ original: { status: "MATCH" }, current: { status: "BLOCKED" } });
  expect((await prisma.prospectResearchCandidate.findUniqueOrThrow({ where: { id: "candidate-20" } })).decision).toMatchObject({ status: "MATCH" });
  expect(await prisma.contact.count()).toBe(0); expect(await prisma.outboundEmail.count()).toBe(0);
});
it("paginates stably without showing another client's records", async () => {
  const first = await loadResearchCandidateReview(staff, "review-client", 0);
  const second = await loadResearchCandidateReview(staff, "review-client", 1);
  expect(first.candidates).toHaveLength(20); expect(first.hasNext).toBe(true);
  expect(second.candidates).toHaveLength(1); expect(second.hasNext).toBe(false);
  expect(new Set([...first.candidates, ...second.candidates].map(row => row.id)).size).toBe(21);
  expect((await loadResearchCandidateReview(staff, "other", 0)).candidates).toEqual([]);
});
it("holds malformed evidence and rejects deleted clients", async () => {
  await prisma.prospectResearchCandidate.update({ where: { id: "candidate-20" }, data: { evidence: { titles: 123 } } });
  expect((await loadResearchCandidateReview(staff, "review-client", 0)).candidates[0].current.status).toBe("REVIEW");
  await prisma.client.update({ where: { id: "review-client" }, data: { deletedAt: new Date() } });
  await expect(loadResearchCandidateReview(staff, "review-client", 0)).rejects.toThrow("FORBIDDEN_CLIENT");
});
