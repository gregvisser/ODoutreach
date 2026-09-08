import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ staff: vi.fn(), access: vi.fn(), target: vi.fn(), list: vi.fn(), importer: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/auth/staff", () => ({ requireOpensDoorsStaff: m.staff }));
vi.mock("@/server/tenant/access", () => ({ requireClientAccess: m.access }));
vi.mock("@/server/contacts/contact-lists", () => ({ resolveImportListTarget: m.target, resolveImportListForClient: m.list }));
vi.mock("@/server/integrations/rocketreach/person-import", () => ({ importRocketReachPeopleForClient: m.importer }));
import { runRocketReachImportAction } from "./rocketreach-import-actions";
const input = { clientId: "synthetic", mode: "builder" as const, industry: "Accounting & Accounting Services", newListName: "Synthetic list", confirmationPhrase: "SEARCH ROCKETREACH" };
beforeEach(() => {
  vi.resetAllMocks();
  m.staff.mockResolvedValue({ id: "staff", isSuperAdmin: false });
  m.access.mockResolvedValue(undefined); m.target.mockReturnValue({ newListName: input.newListName });
  m.list.mockResolvedValue({ id: "list", name: input.newListName, clientId: input.clientId });
  m.importer.mockResolvedValue({ ok: true, imported: 1, errors: [] });
});
it("passes an industry-only search using the documented provider key and retains the credit cap", async () => {
  expect(await runRocketReachImportAction(input)).toMatchObject({ ok: true });
  expect(m.importer).toHaveBeenCalledWith(expect.objectContaining({ clientId: input.clientId, searchBody: { query: { company_industry: [input.industry] }, start: 1, page_size: 10, order_by: "relevance" } }));
});
it("combines industry with the existing search fields without changing their meaning", async () => {
  await runRocketReachImportAction({ ...input, keyword: " tax ", companyName: " Example ", currentTitle: " Director ", location: " London ", pageSize: 3 });
  expect(m.importer).toHaveBeenCalledWith(expect.objectContaining({ searchBody: { query: { company_industry: [input.industry], keyword: ["tax"], company_name: ["Example"], current_title: ["Director"], location: ["London"] }, start: 1, page_size: 3, order_by: "relevance" } }));
});
it.each([{ industry: "Invented unsupported category" }, { confirmationPhrase: "" }, { pageSize: 11 }, { industry: "" }])("rejects invalid or unconfirmed search before list creation: %j", async change => {
  expect(await runRocketReachImportAction({ ...input, ...change })).toMatchObject({ ok: false });
  expect(m.list).not.toHaveBeenCalled(); expect(m.importer).not.toHaveBeenCalled();
});
it("retains client access enforcement", async () => {
  m.access.mockRejectedValue(Error("Denied"));
  expect(await runRocketReachImportAction(input)).toMatchObject({ ok: false });
  expect(m.importer).not.toHaveBeenCalled();
});
