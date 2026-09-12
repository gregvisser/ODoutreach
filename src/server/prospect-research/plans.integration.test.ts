import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetIntegrationDatabase, closeIntegrationPool } from "@/test/integration/database";
import { saveResearchPlan, listResearchPlans } from "./plans";
const staff = { id: "research-staff", role: "OPERATOR" as const };
const input = { name: "Synthetic plan", criteria: { titles: ["Director"], industries: ["Manufacturing"], seniorities: ["Director"], regions: ["United Kingdom"] }, maxLookups: 10 };
beforeEach(async () => {
  await resetIntegrationDatabase();
  vi.stubGlobal("fetch", vi.fn(() => { throw Error("No network authorised"); }));
  await prisma.staffUser.create({ data: { ...staff, entraObjectId: staff.id, email: "staff@example.test" } });
  await prisma.client.createMany({ data: [{ id: "research-a", name: "Synthetic A", slug: "research-a" }, { id: "research-b", name: "Synthetic B", slug: "research-b" }] });
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });
afterAll(async () => { await prisma.$disconnect(); await closeIntegrationPool(); });
it("ordinary staff persist criteria and an audit without importing or sending", async () => {
  const saved = await saveResearchPlan(staff, "research-a", input);
  expect(saved).toMatchObject({ ...input, createdByStaffId: staff.id, clientId: "research-a" });
  expect(await listResearchPlans(staff, "research-a")).toHaveLength(1);
  expect(await listResearchPlans(staff, "research-b")).toEqual([]);
  expect(await prisma.auditLog.findFirstOrThrow()).toMatchObject({ entityId: saved.id, staffUserId: staff.id, metadata: { state: "DRAFT", providerCallsAuthorised: false } });
  expect(await prisma.contact.count()).toBe(0);
  expect(await prisma.outboundEmail.count()).toBe(0);
});
it("rejects invalid budgets without writing a plan or audit", async () => {
  await expect(saveResearchPlan(staff, "research-a", { ...input, maxLookups: 101 })).rejects.toThrow();
  expect(await prisma.prospectResearchPlan.count()).toBe(0);
  expect(await prisma.auditLog.count()).toBe(0);
});
it("cannot save or read plans for a deleted or missing workspace", async () => {
  await prisma.client.update({ where: { id: "research-a" }, data: { deletedAt: new Date() } });
  for (const id of ["research-a", "missing"]) {
    await expect(saveResearchPlan(staff, id, input)).rejects.toThrow("FORBIDDEN_CLIENT");
    await expect(listResearchPlans(staff, id)).rejects.toThrow("FORBIDDEN_CLIENT");
  }
});
it("rolls back the plan if its audit cannot be recorded", async () => {
  await expect(saveResearchPlan({ ...staff, id: "missing-staff" }, "research-a", input)).rejects.toThrow();
  expect(await prisma.prospectResearchPlan.count()).toBe(0);
});
