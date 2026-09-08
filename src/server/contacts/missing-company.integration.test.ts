import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetIntegrationDatabase, closeIntegrationPool } from "@/test/integration/database";
import { setMissingContactCompany } from "./missing-company";
import { evaluateCompanyName } from "@/server/suppression/company-names";
import { evaluateSuppression, refreshContactSuppressionFlagsForClient } from "@/server/outreach/suppression-guard";

beforeEach(async () => {
  vi.stubGlobal("fetch", vi.fn(() => { throw Error("NETWORK BLOCKED"); }));
  vi.stubEnv("STAFF_EMAIL_DOMAINS", "example.test");
  vi.stubEnv("INTERNAL_SEED_ALLOWLIST_ENABLED", "false");
  await resetIntegrationDatabase();
  await prisma.staffUser.create({ data: { id: "staff", entraObjectId: "staff", email: "staff@example.test", role: "OPERATOR" } });
  await prisma.client.createMany({ data: [{ id: "client", name: "Employer fixture", slug: "employer-fixture" }, { id: "other", name: "Other fixture", slug: "other-fixture" }] });
  await prisma.contact.create({ data: { id: "contact", clientId: "client", email: "person@example.test", company: null, isSuppressed: true } });
  await prisma.companyDncEntry.create({ data: { clientId: "client", originalName: "Acme", canonicalName: "acme" } });
});
afterEach(async () => {
  await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS fail_employer_audit ON "AuditLog"');
  await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS fail_employer_audit()');
  expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
});
afterAll(async () => { await prisma.$disconnect(); await closeIntegrationPool(); });
const input = { clientId: "client", contactId: "contact", staffUserId: "staff", company: "Acme" };
it.each([["Acme Limited", "BLOCK"], ["Acme Group", "REVIEW"], ["Birch Engineering", "CLEAR"]])("saves %s then applies current company checks as %s without sending", async (company, outcome) => {
  expect(await setMissingContactCompany({ ...input, company: ` ${company} ` })).toMatchObject({ ok: true });
  await refreshContactSuppressionFlagsForClient("client");
  expect(await evaluateCompanyName("client", company)).toMatchObject({ outcome });
  expect(await prisma.contact.findUniqueOrThrow({ where: { id: "contact" } })).toMatchObject({ company, isSuppressed: outcome !== "CLEAR" });
  expect(await prisma.auditLog.findFirstOrThrow()).toMatchObject({ staffUserId: "staff", entityId: "contact", metadata: { kind: "missing_contact_company_set", previousCompany: null, company } });
  expect(await prisma.outboundEmail.count()).toBe(0);
});
it("preserves an email block even when the added employer is not listed", async () => {
  await prisma.suppressedEmail.create({ data: { clientId: "client", email: "person@example.test" } });
  expect(await setMissingContactCompany({ ...input, company: "Birch Engineering" })).toMatchObject({ ok: true });
  await refreshContactSuppressionFlagsForClient("client");
  expect(await evaluateSuppression("client", "person@example.test")).toMatchObject({ suppressed: true, reason: "email_list" });
  expect((await prisma.contact.findUniqueOrThrow({ where: { id: "contact" } })).isSuppressed).toBe(true);
});
it.each(["inactive", "domain", "deleted", "wrong-client", "missing-contact", "missing-staff"])("rejects %s without changing the contact", async mode => {
  const request = { ...input };
  if (mode === "inactive") await prisma.staffUser.update({ where: { id: "staff" }, data: { isActive: false } });
  if (mode === "domain") await prisma.staffUser.update({ where: { id: "staff" }, data: { email: "staff@other.test" } });
  if (mode === "deleted") await prisma.client.update({ where: { id: "client" }, data: { deletedAt: new Date() } });
  if (mode === "wrong-client") request.clientId = "other";
  if (mode === "missing-contact") request.contactId = "absent";
  if (mode === "missing-staff") request.staffUserId = "absent";
  expect(await setMissingContactCompany(request)).toMatchObject({ ok: false });
  expect((await prisma.contact.findUniqueOrThrow({ where: { id: "contact" } })).company).toBeNull();
  expect(await prisma.auditLog.count()).toBe(0);
});
it("does not overwrite an employer supplied by another update", async () => {
  await prisma.contact.update({ where: { id: "contact" }, data: { company: "Original Employer" } });
  expect(await setMissingContactCompany(input)).toMatchObject({ ok: false });
  expect((await prisma.contact.findUniqueOrThrow({ where: { id: "contact" } })).company).toBe("Original Employer");
});
it("records only one employer and audit under competing submissions", async () => {
  const results = await Promise.all([setMissingContactCompany(input), setMissingContactCompany({ ...input, company: "Birch" })]);
  expect(results.filter(result => result.ok)).toHaveLength(1);
  expect(await prisma.auditLog.count()).toBe(1);
});
it("rolls back an employer whose audit fails and allows a safe retry", async () => {
  await prisma.$executeRawUnsafe("CREATE FUNCTION fail_employer_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$");
  await prisma.$executeRawUnsafe('CREATE TRIGGER fail_employer_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION fail_employer_audit()');
  expect(await setMissingContactCompany(input)).toMatchObject({ ok: false, uncertain: true });
  expect((await prisma.contact.findUniqueOrThrow({ where: { id: "contact" } })).company).toBeNull();
  await prisma.$executeRawUnsafe('DROP TRIGGER fail_employer_audit ON "AuditLog"');
  expect(await setMissingContactCompany(input)).toMatchObject({ ok: true });
});
