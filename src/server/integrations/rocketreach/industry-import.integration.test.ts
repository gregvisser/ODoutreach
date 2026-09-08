import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { closeIntegrationPool, resetIntegrationDatabase } from "@/test/integration/database";
import { importRocketReachPeopleForClient, ROCKETREACH_API_V2_SEARCH, ROCKETREACH_API_V2_LOOKUP } from "./person-import";
import { countContactUniverses, listContactUniversesForTable } from "@/server/queries/contact-universe-list";
const clientId = "industry-synthetic-client";
beforeEach(async () => {
  await resetIntegrationDatabase();
  vi.stubEnv("ROCKETREACH_API_KEY", "synthetic-key-never-sent");
  await prisma.client.create({ data: { id: clientId, name: "Synthetic industry import", slug: clientId } });
  await prisma.contactList.create({ data: { id: "industry-list", clientId, name: "Industry list" } });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
afterAll(async () => { await prisma.$disconnect(); await closeIntegrationPool(); });
it("persists provider industry into contact and Universe, then filters/counts it from the database", async () => {
  const transport = vi.fn(async (url: string, options?: RequestInit) => {
    if (url === ROCKETREACH_API_V2_SEARCH) {
      expect(JSON.parse(String(options?.body))).toMatchObject({ query: { company_industry: ["Accounting & Accounting Services"] } });
      return Response.json({ profiles: [{ id: 1 }] });
    }
    if (url === `${ROCKETREACH_API_V2_LOOKUP}?id=1`) return Response.json({ name: "Synthetic Accountant", recommended_professional_email: "accountant@example.test", current_employer: "Synthetic Accounts", company_industry: "Accounting & Accounting Services" });
    throw Error(`Unexpected network request: ${url}`);
  });
  vi.stubGlobal("fetch", transport);
  const result = await importRocketReachPeopleForClient({ clientId, contactListId: "industry-list", targetListName: "Industry list", searchBody: { query: { company_industry: ["Accounting & Accounting Services"] }, page_size: 1 } });
  expect(result).toMatchObject({ ok: true, imported: 1, universeCreated: 1 });
  expect(transport).toHaveBeenCalledTimes(2);
  expect(await prisma.contact.findFirst({ where: { clientId } })).toMatchObject({ industry: "Accounting & Accounting Services" });
  expect(await listContactUniversesForTable({ industry: " ACCOUNTING ", sourceType: "ROCKETREACH" })).toMatchObject({ total: 1, rows: [expect.objectContaining({ industry: "Accounting & Accounting Services" })] });
  expect(await countContactUniverses({ industry: "mining" })).toBe(0);
  expect(await prisma.outboundEmail.count()).toBe(0);
});
it("filters before pagination and keeps count, combined filters and later pages consistent", async () => {
  vi.stubGlobal("fetch", vi.fn(() => { throw Error("Network forbidden"); }));
  await prisma.contactUniverse.createMany({ data: Array.from({ length: 61 }, (_, i) => ({ id: `industry-${i}`, fullName: `Person ${String(i).padStart(3, "0")}`, industry: i < 31 ? "Accounting & Accounting Services" : "Mining", companyName: i % 2 ? "Birch" : "Oak" })) });
  const first = await listContactUniversesForTable({ industry: "ACCOUNTING", page: 1, pageSize: 25, sort: "name" });
  const second = await listContactUniversesForTable({ industry: "accounting", page: 2, pageSize: 25, sort: "name" });
  expect(first.total).toBe(31); expect(first.rows).toHaveLength(25); expect(second.total).toBe(31); expect(second.rows).toHaveLength(6);
  expect(new Set([...first.rows, ...second.rows].map(r => r.id)).size).toBe(31);
  expect(await countContactUniverses({ industry: "Accounting", company: "oak" })).toBe(16);
  expect((await listContactUniversesForTable({ industry: "Accounting", company: "oak" })).total).toBe(16);
  expect(await countContactUniverses({ industry: " " })).toBe(61);
  expect(fetch).not.toHaveBeenCalled();
});
