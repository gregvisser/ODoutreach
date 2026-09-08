import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetIntegrationDatabase, closeIntegrationPool } from "@/test/integration/database";
import { addCompanyNames, evaluateCompanyName } from "./company-names";
import { applyCompanySheetRead, recordCompanySheetReadFailure, saveCompanySheetSource } from "./company-name-sheet-source";

const clientId = "sheet-client", staffUserId = "sheet-staff";
const connection = { clientId, staffUserId, urlOrId: "synthetic_spreadsheet_identifier_000001", tabName: "Sheet1" };
const sync = (source: { id: string; revision: number }, values: unknown) => applyCompanySheetRead({ sourceId: source.id, revision: source.revision, values, staffUserId });
async function clearFault() {
  await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS company_sheet_audit_fault ON "AuditLog"');
  await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS company_sheet_audit_fault()');
}
beforeEach(async () => {
  vi.stubGlobal("fetch", vi.fn(() => { throw Error("No provider calls"); }));
  await clearFault();
  await resetIntegrationDatabase();
  await prisma.staffUser.create({ data: { id: staffUserId, entraObjectId: staffUserId, email: "staff@example.test", role: "OPERATOR" } });
  await prisma.client.createMany({ data: [{ id: clientId, name: "Synthetic sheet client", slug: clientId }, { id: "other-client", name: "Other", slug: "other-client" }] });
});
afterEach(async () => { await clearFault(); expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });
afterAll(async () => { await prisma.$disconnect(); await closeIntegrationPool(); });

describe("company-name sheet atomic persistence", () => {
  it("lets ordinary staff save a connection without enabling blocks before a valid read", async () => {
    const source = await saveCompanySheetSource(connection);
    expect(source).toMatchObject({ revision: 0, lastSuccessAt: null, knownNames: [] });
    expect(await prisma.companyDncEntry.count()).toBe(0);
    expect(await prisma.auditLog.findFirst()).toMatchObject({ staffUserId, entityType: "CompanyDncSheetSource" });
  });
  it("adds headerless names and enforces them only for this client", async () => {
    const source = await saveCompanySheetSource(connection);
    expect(await sync(source, [[], ["Acme, Services Ltd"], ["Other Group"]])).toMatchObject({ ok: true, added: 2, currentCount: 2 });
    expect(await evaluateCompanyName(clientId, "Acme, Services Ltd")).toMatchObject({ outcome: "BLOCK" });
    expect(await evaluateCompanyName("other-client", "Acme, Services Ltd")).toMatchObject({ outcome: "CLEAR" });
    expect(await prisma.companyDncSheetSource.findUnique({ where: { id: source.id } })).toMatchObject({ revision: 1, lastError: null, lastSuccessAt: expect.any(Date) });
  });
  it("keeps removed and manually entered blocks across repeated sheet changes", async () => {
    await addCompanyNames({ clientId, staffUserId, text: "Manual Company", format: "text" });
    let source = await saveCompanySheetSource(connection);
    await sync(source, [["Acme"], ["Old Company"]]);
    source = await prisma.companyDncSheetSource.findUniqueOrThrow({ where: { id: source.id } });
    expect(await sync(source, [["Acme"], ["New Company"]])).toMatchObject({ ok: true, added: 1, retainedCount: 1 });
    source = await prisma.companyDncSheetSource.findUniqueOrThrow({ where: { id: source.id } });
    expect(await sync(source, [["Acme"], ["New Company"]])).toMatchObject({ ok: true, added: 0, retainedCount: 1 });
    for (const name of ["Manual Company", "Old Company", "New Company"]) expect(await evaluateCompanyName(clientId, name)).toMatchObject({ outcome: "BLOCK" });
    expect(await prisma.companyDncEntry.count({ where: { clientId } })).toBe(4);
  });
  it("rejects a stale read after a staff member changes the sheet connection", async () => {
    const old = await saveCompanySheetSource(connection);
    const current = await saveCompanySheetSource({ ...connection, tabName: "Replacement" });
    expect(await sync(old, [["Wrong Old Sheet"]])).toMatchObject({ ok: false, stale: true });
    expect(await prisma.companyDncEntry.count()).toBe(0);
    expect(await prisma.companyDncSheetSource.findUnique({ where: { id: current.id } })).toMatchObject({ tabName: "Replacement", revision: 1, lastAttemptAt: null });
  });
  it("accepts only one concurrent result for a source revision", async () => {
    const source = await saveCompanySheetSource(connection);
    const results = await Promise.all([sync(source, [["First Company"]]), sync(source, [["Second Company"]])]);
    expect(results.filter(result => result.ok)).toHaveLength(1);
    expect(results.filter(result => !result.ok && result.stale)).toHaveLength(1);
    expect(await prisma.companyDncEntry.count()).toBe(1);
  });
  it("does not let a delayed read failure overwrite a newer successful result", async () => {
    const source = await saveCompanySheetSource(connection);
    await sync(source, [["Acme"]]);
    expect(await recordCompanySheetReadFailure(source.id, source.revision, "Synthetic stale failure")).toMatchObject({ ok: false, stale: true });
    expect(await prisma.companyDncSheetSource.findUnique({ where: { id: source.id } })).toMatchObject({ lastError: null, revision: 1, lastSuccessAt: expect.any(Date) });
  });
  it("rolls back names and checkpoint if the sync audit fails, then allows a complete retry", async () => {
    const source = await saveCompanySheetSource(connection);
    await prisma.$executeRawUnsafe(`CREATE FUNCTION company_sheet_audit_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."entityType"='CompanyDncSheetSource' THEN RAISE EXCEPTION 'synthetic sync audit failure'; END IF; RETURN NEW; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER company_sheet_audit_fault BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION company_sheet_audit_fault()`);
    await expect(sync(source, [["Acme"]])).rejects.toThrow("synthetic sync audit failure");
    expect(await prisma.companyDncEntry.count()).toBe(0);
    expect(await prisma.companyDncSheetSource.findUnique({ where: { id: source.id } })).toMatchObject({ revision: 0, lastAttemptAt: null });
    await clearFault();
    expect(await sync(source, [["Acme"]])).toMatchObject({ ok: true, added: 1 });
  });
  it("records invalid/empty reads without changing the last successful names or removing blocks", async () => {
    let source = await saveCompanySheetSource(connection);
    await sync(source, [["Acme"]]);
    source = await prisma.companyDncSheetSource.findUniqueOrThrow({ where: { id: source.id } });
    expect(await sync(source, [])).toMatchObject({ ok: false, stale: false });
    const saved = await prisma.companyDncSheetSource.findUniqueOrThrow({ where: { id: source.id } });
    expect(saved.currentNames).toEqual(source.currentNames);
    expect(saved.lastSuccessAt).toEqual(source.lastSuccessAt);
    expect(saved.lastError).toContain("at least one company");
    expect(await evaluateCompanyName(clientId, "Acme")).toMatchObject({ outcome: "BLOCK" });
  });
  it("refuses inactive staff and deleted clients for connection changes and sync commits", async () => {
    const source = await saveCompanySheetSource(connection);
    await prisma.staffUser.update({ where: { id: staffUserId }, data: { isActive: false } });
    await expect(saveCompanySheetSource(connection)).rejects.toThrow("Active staff");
    await expect(sync(source, [["Acme"]])).rejects.toThrow("Active staff");
    await prisma.client.update({ where: { id: clientId }, data: { deletedAt: new Date() } });
    await expect(applyCompanySheetRead({ sourceId: source.id, revision: 0, values: [["Acme"]], staffUserId: null })).rejects.toThrow("Client unavailable");
    expect(await prisma.companyDncEntry.count()).toBe(0);
  });
});
