import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ staff: vi.fn(), access: vi.fn(), save: vi.fn(), load: vi.fn(), sync: vi.fn(), refresh: vi.fn(), labels: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: m.refresh }));
vi.mock("@/server/auth/staff", () => ({ requireOpensDoorsStaff: m.staff }));
vi.mock("@/server/tenant/access", () => ({ requireClientAccess: m.access }));
vi.mock("@/server/suppression/company-name-sheet-source", () => ({ loadCompanySheetSource: m.load, saveCompanySheetSource: m.save }));
vi.mock("@/server/integrations/google-sheets/company-name-sheet-sync", () => ({ syncCompanyNameSheet: m.sync }));
vi.mock("@/server/outreach/suppression-guard", () => ({ refreshContactSuppressionFlagsForClient: m.labels }));
import { saveCompanySheetAction, syncCompanySheetAction } from "./company-sheet-actions";
const input = { clientId: "client", urlOrId: "synthetic_spreadsheet_identifier_000001", tabName: "Sheet1" };
beforeEach(() => {
  vi.resetAllMocks(); m.staff.mockResolvedValue({ id: "session-staff" }); m.access.mockResolvedValue(undefined);
  m.save.mockResolvedValue({ id: "saved-source", currentNames: [] }); m.load.mockResolvedValue({ id: "saved-source", currentNames: [] });
  m.sync.mockResolvedValue({ ok: true, currentCount: 7, added: 2, retainedCount: 1 });
});
it("rejects signed-out or inaccessible clients before save or sync", async () => {
  m.staff.mockRejectedValue(Error("signed out"));
  expect(await saveCompanySheetAction(input)).toMatchObject({ ok: false, uncertain: false });
  m.staff.mockResolvedValue({ id: "session-staff" }); m.access.mockRejectedValue(Error("wrong client"));
  expect(await syncCompanySheetAction("client")).toMatchObject({ ok: false });
  expect(m.save).not.toHaveBeenCalled(); expect(m.sync).not.toHaveBeenCalled();
});
it("validates URL before starting work and uses only the authenticated staff identity", async () => {
  expect(await saveCompanySheetAction({ ...input, urlOrId: "invalid" })).toMatchObject({ ok: false, uncertain: false });
  expect(m.save).not.toHaveBeenCalled();
  m.refresh.mockImplementation(() => { throw Error("cache failed"); });
  expect(await saveCompanySheetAction({ ...input, staffUserId: "forged" } as never)).toMatchObject({ ok: true, source: { id: "saved-source" } });
  expect(m.save).toHaveBeenCalledWith({ ...input, staffUserId: "session-staff" });
});
it("loads the source from the authorised client and returns retained-name counts", async () => {
  expect(await syncCompanySheetAction("client")).toMatchObject({ ok: true, message: expect.stringContaining("1 names missing") });
  expect(m.load).toHaveBeenCalledWith("client");
  expect(m.sync).toHaveBeenCalledWith("saved-source", "session-staff");
});
it("marks ambiguous saves and syncs as uncertain", async () => {
  m.save.mockRejectedValue(Error("connection lost")); m.sync.mockRejectedValue(Error("connection lost"));
  expect(await saveCompanySheetAction(input)).toMatchObject({ ok: false, uncertain: true });
  expect(await syncCompanySheetAction("client")).toMatchObject({ ok: false, uncertain: true });
});
