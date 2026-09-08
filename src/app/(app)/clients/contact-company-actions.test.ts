import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ staff: vi.fn(), access: vi.fn(), save: vi.fn(), refresh: vi.fn(), load: vi.fn() }));
vi.mock("@/server/auth/staff", () => ({ requireOpensDoorsStaff: m.staff }));
vi.mock("@/server/tenant/access", () => ({ requireClientAccess: m.access }));
vi.mock("@/server/contacts/missing-company", () => ({ setMissingContactCompany: m.save }));
vi.mock("@/server/outreach/suppression-guard", () => ({ refreshContactSuppressionFlagsForClient: m.refresh }));
vi.mock("@/server/suppression/company-names", () => ({ loadCompanyDncPage: m.load }));
import { setMissingContactCompanyAction, refreshCompanyContactChecksAction } from "./contact-company-actions";
const input = { clientId: "client", contactId: "contact", company: "Acme", page: 0, heldPage: 0 };
beforeEach(() => { vi.resetAllMocks(); m.staff.mockResolvedValue({ id: "real-staff" }); m.access.mockResolvedValue(undefined); m.save.mockResolvedValue({ ok: true }); m.refresh.mockResolvedValue({}); m.load.mockResolvedValue({ contacts: [] }); });
it("uses authenticated staff and returns freshly checked client-scoped data", async () => {
  expect(await setMissingContactCompanyAction({ ...input, staffUserId: "forged" } as typeof input)).toMatchObject({ ok: true, data: { contacts: [] } });
  expect(m.save).toHaveBeenCalledWith({ ...input, staffUserId: "real-staff" });
  expect(m.refresh).toHaveBeenCalledWith("client");
  expect(m.load).toHaveBeenCalledWith("client", 0, 0);
});
it.each(["", " ", "a".repeat(301)])("rejects invalid input before persistence (%s)", async company => {
  expect(await setMissingContactCompanyAction({ ...input, company })).toMatchObject({ ok: false });
  expect(m.save).not.toHaveBeenCalled();
});
it.each(["staff", "access"] as const)("refuses denied %s access", async method => {
  m[method].mockRejectedValue(Error("Denied"));
  expect(await setMissingContactCompanyAction(input)).toMatchObject({ ok: false });
  expect(m.save).not.toHaveBeenCalled();
});
it("reports a saved employer separately from unfinished checks and permits a check-only recovery", async () => {
  m.refresh.mockRejectedValueOnce(Error("Temporary database failure"));
  expect(await setMissingContactCompanyAction(input)).toMatchObject({ ok: false, uncertain: true });
  expect(m.save).toHaveBeenCalledTimes(1);
  expect(await refreshCompanyContactChecksAction(input)).toMatchObject({ ok: true });
  expect(m.save).toHaveBeenCalledTimes(1);
});
it("does not refresh or claim success after a conflicting employer update", async () => {
  m.save.mockResolvedValue({ ok: false, error: "Already changed" });
  expect(await setMissingContactCompanyAction(input)).toMatchObject({ ok: false });
  expect(m.refresh).not.toHaveBeenCalled();
});
