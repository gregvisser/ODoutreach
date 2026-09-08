import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetIntegrationDatabase, closeIntegrationPool } from "@/test/integration/database";
import { setClientServiceTier } from "./service-tier";
import { SERVICE_TIERS } from "@/lib/clients/service-tier";

beforeEach(async () => {
  vi.stubGlobal("fetch", vi.fn(() => { throw Error("NETWORK BLOCKED"); }));
  vi.stubEnv("STAFF_EMAIL_DOMAINS", "example.test");
  await resetIntegrationDatabase();
  await prisma.staffUser.create({ data: { id: "staff", entraObjectId: "staff-entra", email: "staff@example.test", role: "OPERATOR", isActive: true, displayName: "Ordinary staff" } });
  await prisma.client.create({ data: { id: "client", name: "Grade fixture", slug: "grade-fixture", accountGrade: "CORPORATE", autonomousSendEnabled: false } });
});
afterEach(async () => {
  await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS fail_grade_audit ON "AuditLog"');
  await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS fail_grade_audit()');
  expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
});
afterAll(async () => { await prisma.$disconnect(); await closeIntegrationPool(); });
const input = { clientId: "client", staffUserId: "staff", tier: "GROWTH" as const, expectedRevision: 0 };
it.each(SERVICE_TIERS)("records %s for ordinary staff without changing sending consent or legacy pacing", async tier => {
  expect(await prisma.client.findUniqueOrThrow({ where: { id: "client" } })).toMatchObject({ serviceTier: null, serviceTierRevision: 0 });
  expect(await setClientServiceTier({ ...input, tier })).toMatchObject({ ok: true, snapshot: { tier, revision: 1, setByName: "Ordinary staff" } });
  expect(await prisma.client.findUniqueOrThrow({ where: { id: "client" } })).toMatchObject({ serviceTier: tier, serviceTierSetByStaffUserId: "staff", serviceTierRevision: 1, accountGrade: "CORPORATE", autonomousSendEnabled: false });
  expect(await prisma.auditLog.findFirst({ where: { clientId: "client" } })).toMatchObject({ staffUserId: "staff", metadata: { kind: "customer_service_tier_set", previousTier: null, tier } });
  expect(await prisma.outboundEmail.count()).toBe(0);
});
it("lets another active ordinary role set a grade", async () => {
  await prisma.staffUser.update({ where: { id: "staff" }, data: { role: "VIEWER" } });
  expect(await setClientServiceTier(input)).toMatchObject({ ok: true });
});
it("rejects a competing stale choice rather than losing the first staff decision", async () => {
  const results = await Promise.all([setClientServiceTier(input), setClientServiceTier({ ...input, tier: "STRATEGIC" })]);
  expect(results.filter(result => result.ok)).toHaveLength(1);
  expect(await prisma.auditLog.count({ where: { clientId: "client" } })).toBe(1);
  expect((await prisma.client.findUniqueOrThrow({ where: { id: "client" } })).serviceTierRevision).toBe(1);
});
it("records the true previous grade for a later reviewed change", async () => {
  expect(await setClientServiceTier(input)).toMatchObject({ ok: true });
  expect(await setClientServiceTier({ ...input, tier: "STRATEGIC", expectedRevision: 1 })).toMatchObject({ ok: true });
  const audits = await prisma.auditLog.findMany({ where: { clientId: "client" }, orderBy: { createdAt: "asc" } });
  expect(audits.map(row => row.metadata)).toEqual([
    { kind: "customer_service_tier_set", previousTier: null, tier: "GROWTH" },
    { kind: "customer_service_tier_set", previousTier: "GROWTH", tier: "STRATEGIC" },
  ]);
});
it.each(["inactive", "domain", "missing-staff", "deleted-client", "missing-client"])("refuses %s", async mode => {
  const request = { ...input };
  if (mode === "inactive") await prisma.staffUser.update({ where: { id: "staff" }, data: { isActive: false } });
  if (mode === "domain") await prisma.staffUser.update({ where: { id: "staff" }, data: { email: "staff@other.test" } });
  if (mode === "missing-staff") request.staffUserId = "absent";
  if (mode === "deleted-client") await prisma.client.update({ where: { id: "client" }, data: { deletedAt: new Date() } });
  if (mode === "missing-client") request.clientId = "absent";
  expect(await setClientServiceTier(request)).toMatchObject({ ok: false });
  expect(await prisma.auditLog.count()).toBe(0);
  expect((await prisma.client.findUniqueOrThrow({ where: { id: "client" } })).serviceTier).toBeNull();
});
it("rolls back grade and attribution if auditing fails, then retries safely", async () => {
  await prisma.$executeRawUnsafe("CREATE FUNCTION fail_grade_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$");
  await prisma.$executeRawUnsafe('CREATE TRIGGER fail_grade_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION fail_grade_audit()');
  expect(await setClientServiceTier(input)).toMatchObject({ ok: false, uncertain: true });
  expect(await prisma.client.findUniqueOrThrow({ where: { id: "client" } })).toMatchObject({ serviceTier: null, serviceTierSetByStaffUserId: null, serviceTierSetAt: null, serviceTierRevision: 0 });
  await prisma.$executeRawUnsafe('DROP TRIGGER fail_grade_audit ON "AuditLog"');
  expect(await setClientServiceTier(input)).toMatchObject({ ok: true });
});
