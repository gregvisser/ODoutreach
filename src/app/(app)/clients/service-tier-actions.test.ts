import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ staff: vi.fn(), access: vi.fn(), save: vi.fn() }));
vi.mock("@/server/auth/staff", () => ({ requireOpensDoorsStaff: m.staff }));
vi.mock("@/server/tenant/access", () => ({ requireClientAccess: m.access }));
vi.mock("@/server/clients/service-tier", () => ({ setClientServiceTier: m.save }));
import { setClientServiceTierAction } from "./service-tier-actions";
const input = { clientId: "client", tier: "GROWTH" as const, expectedRevision: 0 };
beforeEach(() => { vi.resetAllMocks(); m.staff.mockResolvedValue({ id: "actual-staff", isSuperAdmin: false }); m.access.mockResolvedValue(undefined); m.save.mockResolvedValue({ ok: true }); });
it("uses authenticated ordinary staff, ignoring forged attribution", async () => {
  const forged = { ...input, staffUserId: "forged-owner" };
  expect(await setClientServiceTierAction(forged)).toMatchObject({ ok: true });
  expect(m.save).toHaveBeenCalledWith({ ...input, staffUserId: "actual-staff" });
});
it.each(["session", "client"])("refuses invalid %s access", async mode => {
  (mode === "session" ? m.staff : m.access).mockRejectedValue(Error("Denied"));
  expect(await setClientServiceTierAction(input)).toMatchObject({ ok: false });
  expect(m.save).not.toHaveBeenCalled();
});
it("refuses an old grade label instead of guessing a new tier", async () => {
  expect(await setClientServiceTierAction({ ...input, tier: "CORPORATE" as "GROWTH" })).toMatchObject({ ok: false });
  expect(m.save).not.toHaveBeenCalled();
});
