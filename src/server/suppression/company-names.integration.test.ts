import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { closeIntegrationPool, resetIntegrationDatabase } from "@/test/integration/database";
import { addCompanyNames, decideCompanyName, evaluateCompanyName, loadCompanyDncPage } from "./company-names";

const clientId = "company-dnc-client", staffUserId = "company-dnc-staff";
const add = (text: string) => addCompanyNames({ clientId, staffUserId, text, format: "text" });
beforeEach(async () => {
  vi.stubGlobal("fetch", vi.fn(() => { throw Error("NETWORK BLOCKED"); }));
  await resetIntegrationDatabase();
  await prisma.client.createMany({ data: [{ id: clientId, name: "Synthetic DNC", slug: clientId }, { id: "other-company-client", name: "Other synthetic client", slug: "other-company-client" }] });
  await prisma.staffUser.create({ data: { id: staffUserId, entraObjectId: "synthetic-company-dnc-entra", email: "staff@example.test", displayName: "Synthetic staff" } });
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });
afterAll(async () => { await prisma.$disconnect(); await closeIntegrationPool(); });

describe("company-name DNC persistence and decisions", () => {
  it("exposes later contact and held-email pages with accurate totals", async () => {
    await add("Acme");
    await prisma.contact.createMany({ data: Array.from({ length: 51 }, (_, i) => ({ id: `page-contact-${String(i).padStart(3, "0")}`, clientId, company: "Acme Group", email: `person${i}@example.test` })) });
    await prisma.outboundEmail.createMany({ data: Array.from({ length: 51 }, (_, i) => ({ id: `page-outbound-${String(i).padStart(3, "0")}`, clientId, toEmail: `person${i}@example.test`, fromAddress: "sender@example.test", subject: "Synthetic held mail", bodySnapshot: "Not sent", status: "FAILED" as const, lastErrorCode: "COMPANY_REVIEW" })) });
    const first = await loadCompanyDncPage(clientId, 0, 0);
    const second = await loadCompanyDncPage(clientId, 1, 1);
    expect(first).toMatchObject({ totalContacts: 51, checkedContacts: 50, heldTotal: 51 });
    expect(first.heldEmails).toHaveLength(50);
    expect(second).toMatchObject({ totalContacts: 51, checkedContacts: 1, heldTotal: 51, page: 1, heldPage: 1 });
    expect(second.contacts[0].id).toBe("page-contact-050");
    expect(second.heldEmails[0].id).toBe("page-outbound-050");
    expect(await loadCompanyDncPage("other-company-client", 0)).toMatchObject({ contacts: [], heldEmails: [], heldTotal: 0, entryTotal: 0 });
  });
  it("imports additively and preserves existing original names", async () => {
    expect(await add("Acme Limited\nBirch Group")).toMatchObject({ ok: true, added: 2 });
    expect(await add("ACME LTD\nOak Inc")).toMatchObject({ ok: true, added: 1, duplicates: 1 });
    expect(await prisma.companyDncEntry.count({ where: { clientId } })).toBe(3);
    expect(await evaluateCompanyName(clientId, "Birch Group")).toMatchObject({ outcome: "BLOCK" });
    expect(await prisma.companyDncEntry.findFirst({ where: { clientId, canonicalName: "acme" } })).toMatchObject({ originalName: "Acme Limited" });
  });
  it("rejects the whole invalid import before writing any entry", async () => {
    expect(await add("Acme\nLtd.")).toMatchObject({ ok: false });
    expect(await prisma.companyDncEntry.count()).toBe(0);
  });
  it("rolls back the list if its audit cannot be saved", async () => {
    await expect(addCompanyNames({ clientId, staffUserId: "missing-staff", text: "Acme", format: "text" })).rejects.toThrow();
    expect(await prisma.companyDncEntry.count()).toBe(0);
  });
  it("keeps names and decisions inside their client, including the database relation", async () => {
    await add("Acme");
    const entry = await prisma.companyDncEntry.findFirstOrThrow({ where: { clientId } });
    expect(await evaluateCompanyName("other-company-client", "Acme")).toMatchObject({ outcome: "CLEAR", reason: "no_list" });
    expect(await decideCompanyName({ clientId: "other-company-client", staffUserId, entryId: entry.id, company: "Acme Group", outcome: "ALLOW" })).toMatchObject({ ok: false });
    await expect(prisma.companyDncDecision.create({ data: { clientId: "other-company-client", entryId: entry.id, companyKey: "acme group", ruleVersion: 1, outcome: "ALLOW" } })).rejects.toThrow();
  });
  it("holds until every similar-name candidate has been reviewed", async () => {
    await add("Acme Group\nAcme UK");
    const entries = await prisma.companyDncEntry.findMany({ where: { clientId }, orderBy: { id: "asc" } });
    expect(await evaluateCompanyName(clientId, "Acme")).toMatchObject({ outcome: "REVIEW" });
    const decide = (entryId: string) => decideCompanyName({ clientId, staffUserId, entryId, company: "Acme", outcome: "ALLOW" });
    await decide(entries[0].id);
    expect(await evaluateCompanyName(clientId, "Acme")).toMatchObject({ outcome: "REVIEW", matchedEntryIds: [entries[1].id] });
    await decide(entries[1].id);
    expect(await evaluateCompanyName(clientId, "Acme")).toMatchObject({ outcome: "CLEAR" });
    await add("Acme Europe");
    expect(await evaluateCompanyName(clientId, "Acme")).toMatchObject({ outcome: "REVIEW" });
  });
  it("never uses an old allowance for a changed employer or rule version", async () => {
    await add("Acme");
    const entry = await prisma.companyDncEntry.findFirstOrThrow({ where: { clientId } });
    await decideCompanyName({ clientId, staffUserId, entryId: entry.id, company: "Acme Group", outcome: "ALLOW" });
    expect(await evaluateCompanyName(clientId, "Acme Group")).toMatchObject({ outcome: "CLEAR" });
    expect(await evaluateCompanyName(clientId, "Acme UK")).toMatchObject({ outcome: "REVIEW" });
    await prisma.companyDncDecision.updateMany({ data: { ruleVersion: 0 } });
    expect(await evaluateCompanyName(clientId, "Acme Group")).toMatchObject({ outcome: "REVIEW" });
  });
  it("preserves exact blocks and records human-confirmed similar blocks", async () => {
    await add("Acme");
    const entry = await prisma.companyDncEntry.findFirstOrThrow({ where: { clientId } });
    expect(await decideCompanyName({ clientId, staffUserId, entryId: entry.id, company: "Acme Ltd", outcome: "ALLOW" })).toMatchObject({ ok: false });
    expect(await evaluateCompanyName(clientId, "Acme Ltd")).toMatchObject({ outcome: "BLOCK" });
    await decideCompanyName({ clientId, staffUserId, entryId: entry.id, company: "Acme Group", outcome: "BLOCK" });
    expect(await evaluateCompanyName(clientId, "Acme Group")).toMatchObject({ outcome: "BLOCK" });
    expect(await prisma.auditLog.count({ where: { entityType: "CompanyDncDecision", staffUserId, clientId } })).toBe(1);
  });
  it("does not bypass an unresolved missing employer", async () => {
    await add("Acme");
    expect(await evaluateCompanyName(clientId, null)).toMatchObject({ outcome: "REVIEW", reason: "missing_company" });
  });
});
