import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetIntegrationDatabase, closeIntegrationPool } from "@/test/integration/database";
import { saveResearchPlan } from "./plans";
import { approveResearchRun, reserveResearchRequest } from "./request-budget";
import { stageResearchCandidate, listResearchCandidates } from "./candidates";
const staff = { id: "candidate-staff", role: "OPERATOR" as const };
const evidence = { titles: "Director", industries: "Manufacturing", seniorities: "Director", regions: "UK" };
let requestId: string;
let runId: string;
const input = () => ({ clientId: "candidate-client", requestId, providerProfileId: "1", email: "person@example.test", company: "Synthetic Manufacturing", evidence });
beforeEach(async () => {
  await resetIntegrationDatabase();
  vi.stubEnv("INTERNAL_SEED_ALLOWLIST_ENABLED", "false");
  vi.stubGlobal("fetch", vi.fn(() => { throw Error("No provider calls"); }));
  await prisma.staffUser.create({ data: { ...staff, entraObjectId: staff.id, email: "staff@example.test" } });
  await prisma.client.createMany({ data: [{ id: "candidate-client", name: "Synthetic", slug: "candidate-client" }, { id: "other", name: "Other", slug: "other" }] });
  const plan = await saveResearchPlan(staff, "candidate-client", { name: "Synthetic staging", criteria: { titles: ["Director"], industries: ["Manufacturing"], seniorities: ["Director"], regions: ["UK"] }, maxLookups: 2 });
  runId = (await approveResearchRun(staff, "candidate-client", plan.id)).id;
  const reserved = await reserveResearchRequest({ clientId: "candidate-client", runId, requestKey: "lookup:1", kind: "LOOKUP" });
  if (!reserved.acquired) throw Error("Fixture reservation failed");
  requestId = reserved.requestId;
});
afterEach(async () => {
  await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS fail_candidate_audit ON "AuditLog"');
  await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS fail_candidate_audit()');
  expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
});
afterAll(async () => { await prisma.$disconnect(); await closeIntegrationPool(); });
it("records fit and an audit outside contact lists", async () => {
  const saved = await stageResearchCandidate(input());
  expect(saved.decision).toMatchObject({ status: "MATCH" });
  expect(await listResearchCandidates(staff, "candidate-client", runId)).toHaveLength(1);
  expect(await listResearchCandidates(staff, "other", runId)).toEqual([]);
  expect(await prisma.auditLog.findFirst({ where: { entityId: saved.id } })).toMatchObject({ entityType: "ProspectResearchCandidate" });
  expect(await prisma.contact.count()).toBe(0); expect(await prisma.outboundEmail.count()).toBe(0);
});
it.each(["email", "company"])("retains a current %s block despite matching targeting", async kind => {
  if (kind === "email") await prisma.suppressedEmail.create({ data: { clientId: "candidate-client", email: "person@example.test" } });
  else await prisma.companyDncEntry.create({ data: { clientId: "candidate-client", originalName: "Synthetic Manufacturing", canonicalName: "synthetic manufacturing" } });
  expect((await stageResearchCandidate(input())).decision).toMatchObject({ status: "BLOCKED" });
});
it.each(["email", "regions"])("holds missing %s evidence for review", async field => {
  const value = input();
  expect((await stageResearchCandidate(field === "email" ? { ...value, email: "" } : { ...value, evidence: { ...evidence, regions: undefined } })).decision).toMatchObject({ status: "REVIEW" });
});
it("rejects wrong client, profile and search reservations", async () => {
  await expect(stageResearchCandidate({ ...input(), clientId: "other" })).rejects.toThrow("RESEARCH_REQUEST_UNAVAILABLE");
  await expect(stageResearchCandidate({ ...input(), providerProfileId: "2" })).rejects.toThrow("RESEARCH_REQUEST_UNAVAILABLE");
  await prisma.prospectResearchRequest.update({ where: { id: requestId }, data: { kind: "SEARCH" } });
  await expect(stageResearchCandidate(input())).rejects.toThrow("RESEARCH_REQUEST_UNAVAILABLE");
});
it("concurrent retries preserve one immutable evidence snapshot", async () => {
  const rows = await Promise.all([stageResearchCandidate(input()), stageResearchCandidate(input())]);
  expect(rows[0].id).toBe(rows[1].id);
  expect((await stageResearchCandidate({ ...input(), company: "Replacement company" })).company).toBe("Synthetic Manufacturing");
  expect(await prisma.auditLog.count({ where: { entityType: "ProspectResearchCandidate" } })).toBe(1);
});
it("rolls back staged evidence if the audit fails", async () => {
  await prisma.$executeRawUnsafe(`CREATE FUNCTION fail_candidate_audit() RETURNS trigger AS $$ BEGIN IF NEW."entityType" = 'ProspectResearchCandidate' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`);
  await prisma.$executeRawUnsafe('CREATE TRIGGER fail_candidate_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION fail_candidate_audit()');
  await expect(stageResearchCandidate(input())).rejects.toThrow();
  expect(await prisma.prospectResearchCandidate.count()).toBe(0);
});
