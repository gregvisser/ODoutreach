import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ staff: vi.fn(), schedule: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
vi.mock("@/server/auth/staff", () => ({ requireOpensDoorsStaff: m.staff }));
vi.mock("@/server/mailbox/client-sending-calendar", () => ({ scheduleClientSendingCalendar: m.schedule }));
import { saveSendingCalendarAction } from "./sending-calendar-actions";
const input = { timeZone: "Europe/London", weekdays: [1, 2, 3, 4, 5], startMinute: 540, endMinute: 1020 };
beforeEach(() => {
  vi.resetAllMocks();
  m.staff.mockResolvedValue({ id: "real-session-staff", role: "OPERATOR" });
  m.schedule.mockResolvedValue({ ok: true, current: null, revision: { ...input, effectiveAt: new Date("2026-09-10T23:00Z"), previousDayEndsAt: new Date("2026-09-10T00:00Z") } });
});
it("never reaches calendar mutation without an authenticated staff session", async () => {
  m.staff.mockRejectedValue(Error("not signed in"));
  expect(await saveSendingCalendarAction("client", input)).toMatchObject({ ok: false });
  expect(m.schedule).not.toHaveBeenCalled();
});
it("passes authenticated staff and returns committed schedule even when cache refresh fails", async () => {
  m.revalidate.mockImplementation(() => { throw Error("refresh failed"); });
  expect(await saveSendingCalendarAction("client", { ...input, staffUserId: "forged" })).toMatchObject({ ok: true, settings: { current: null, pending: { ...input, effectiveAt: "2026-09-10T23:00:00.000Z" } } });
  expect(m.schedule).toHaveBeenCalledWith({ id: "real-session-staff", role: "OPERATOR" }, "client", expect.anything());
});
it("does not claim a failed or ambiguous save succeeded", async () => {
  m.schedule.mockRejectedValue(Error("connection lost"));
  expect(await saveSendingCalendarAction("client", input)).toMatchObject({ ok: false, uncertain: true });
  expect(m.revalidate).not.toHaveBeenCalled();
});
it("keeps a pending-change refusal distinct from an uncertain save", async () => {
  m.schedule.mockResolvedValue({ ok: false, error: "A calendar change is already scheduled." });
  expect(await saveSendingCalendarAction("client", input)).toEqual({ ok: false, error: "A calendar change is already scheduled." });
});
