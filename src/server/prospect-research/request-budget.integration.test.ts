import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetIntegrationDatabase, closeIntegrationPool } from "@/test/integration/database";
import { saveResearchPlan } from "./plans";
import { approveResearchRun, reserveResearchRequest, pauseResearchRun } from "./request-budget";
const staff = { id: "budget-staff", role: "OPERATOR" as const };
let runId: string;
beforeEach(async () => {
  await resetIntegrationDatabase();
  vi.stubGlobal("fetch", vi.fn(() => { throw Error("No provider calls"); }));
  await prisma.staffUser.create({ data: { ...staff, entraObjectId: staff.id, email: "staff@example.test" } });
  await prisma.client.createMany({ data: [{ id: "budget-client", name: "Synthetic", slug: "budget-client" }, { id: "other", name: "Other", slug: "other" }] });
  const plan = await saveResearchPlan(staff, "budget-client", { name: "Synthetic budget", criteria: { titles: ["Director"], industries: ["Manufacturing"], seniorities: ["Director"], regions: ["UK"] }, maxLookups: 2 });
  runId = (await approveResearchRun(staff, "budget-client", plan.id)).id;
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });
afterAll(async () => { await prisma.$disconnect(); await closeIntegrationPool(); });
const reserve = (requestKey: string, kind: "SEARCH" | "LOOKUP" = "LOOKUP") => reserveResearchRequest({ clientId: "budget-client", runId, requestKey, kind });
it("concurrent workers cannot exceed the finite lookup allowance", async () => {
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => reserve(`lookup:${i}`)));
  expect(results.filter(r => r.acquired)).toHaveLength(2);
  expect(await prisma.prospectResearchRequest.count()).toBe(2);
});
it("concurrent retries acquire the same request only once", async () => {
  const results = await Promise.all([reserve("lookup:1"), reserve("lookup:1")]);
  expect(results.filter(r => r.acquired)).toHaveLength(1);
  expect(results.filter(r => !r.acquired)).toMatchObject([{ reason: "ALREADY_RESERVED" }]);
});
it("search has its own one-request limit and unknown outcomes are not refunded", async () => {
  expect((await reserve("search:1", "SEARCH")).acquired).toBe(true);
  expect(await reserve("search:2", "SEARCH")).toMatchObject({ acquired: false, reason: "BUDGET_EXHAUSTED" });
  expect((await reserve("lookup:1")).acquired).toBe(true);
  expect(await reserve("lookup:1")).toMatchObject({ acquired: false, reason: "ALREADY_RESERVED" });
});
it("wrong-client and deleted-client requests are refused", async () => {
  expect(await reserveResearchRequest({ clientId: "other", runId, requestKey: "x", kind: "LOOKUP" })).toMatchObject({ acquired: false, reason: "UNAVAILABLE" });
  await prisma.client.update({ where: { id: "budget-client" }, data: { deletedAt: new Date() } });
  expect(await reserve("x")).toMatchObject({ acquired: false, reason: "UNAVAILABLE" });
});
it("reapproval never resets consumed allowance or resumes a paused run", async () => {
  await reserve("lookup:1"); await reserve("lookup:2");
  const run = await prisma.prospectResearchRun.findUniqueOrThrow({ where: { id: runId } });
  expect((await approveResearchRun(staff, "budget-client", run.planId)).id).toBe(runId);
  expect(await reserve("lookup:3")).toMatchObject({ reason: "BUDGET_EXHAUSTED" });
  await pauseResearchRun(staff, "budget-client", runId);
  await approveResearchRun(staff, "budget-client", run.planId);
  expect(await reserve("lookup:4")).toMatchObject({ reason: "PAUSED" });
});
it("concurrent approvals create one run and one approval audit", async () => {
  const plan = await saveResearchPlan(staff, "budget-client", { name: "Second synthetic plan", criteria: { titles: ["Director"], industries: ["Manufacturing"], seniorities: ["Director"], regions: ["UK"] }, maxLookups: 1 });
  const runs = await Promise.all([approveResearchRun(staff, "budget-client", plan.id), approveResearchRun(staff, "budget-client", plan.id)]);
  expect(runs[0].id).toBe(runs[1].id);
  expect(await prisma.auditLog.count({ where: { entityId: runs[0].id, entityType: "ProspectResearchRun" } })).toBe(1);
  await expect(approveResearchRun(staff, "other", plan.id)).rejects.toThrow("RESEARCH_PLAN_UNAVAILABLE");
});
it("approval and pause roll back when their audit fails", async () => {
  const plan = await saveResearchPlan(staff, "budget-client", { name: "Audit rollback plan", criteria: { titles: ["Director"], industries: ["Manufacturing"], seniorities: ["Director"], regions: ["UK"] }, maxLookups: 1 });
  const missingStaff = { ...staff, id: "nonexistent-staff" };
  await expect(approveResearchRun(missingStaff, "budget-client", plan.id)).rejects.toThrow();
  expect(await prisma.prospectResearchRun.count({ where: { planId: plan.id } })).toBe(0);
  await expect(pauseResearchRun(missingStaff, "budget-client", runId)).rejects.toThrow();
  expect((await prisma.prospectResearchRun.findUniqueOrThrow({ where: { id: runId } })).pausedAt).toBeNull();
});
