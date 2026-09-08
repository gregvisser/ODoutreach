import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ staff: vi.fn(), access: vi.fn(), approve: vi.fn() }));
vi.mock("@/server/auth/staff", () => ({ requireOpensDoorsStaff: m.staff }));
vi.mock("@/server/tenant/access", () => ({ requireClientAccess: m.access }));
vi.mock("@/server/email/outbound/staff-review", () => ({ approveHeldEmail: m.approve }));
import { approveHeldEmailAction } from "./held-email-actions";
const input = { clientId: "client", outboundEmailId: "held", reviewToken: "a".repeat(64) };
beforeEach(() => { vi.resetAllMocks(); m.staff.mockResolvedValue({ id: "authenticated-staff", isSuperAdmin: false }); m.access.mockResolvedValue(undefined); m.approve.mockResolvedValue({ ok: true }); });
it("uses the authenticated ordinary staff identity, ignoring a forged input identity", async () => {
  const forged = { ...input, staffUserId: "forged-owner" };
  expect(await approveHeldEmailAction(forged)).toMatchObject({ ok: true });
  expect(m.approve).toHaveBeenCalledWith({ ...input, staffUserId: "authenticated-staff" });
});
it("refuses a signed-out or inactive session before approval", async () => {
  m.staff.mockRejectedValue(Error("Unauthorized"));
  expect(await approveHeldEmailAction(input)).toMatchObject({ ok: false });
  expect(m.approve).not.toHaveBeenCalled();
});
it("refuses an inaccessible client before approval", async () => {
  m.access.mockRejectedValue(Error("FORBIDDEN_CLIENT"));
  expect(await approveHeldEmailAction(input)).toMatchObject({ ok: false });
  expect(m.approve).not.toHaveBeenCalled();
});
it("rejects an absent content review token", async () => {
  expect(await approveHeldEmailAction({ ...input, reviewToken: "" })).toMatchObject({ ok: false });
  expect(m.approve).not.toHaveBeenCalled();
});
