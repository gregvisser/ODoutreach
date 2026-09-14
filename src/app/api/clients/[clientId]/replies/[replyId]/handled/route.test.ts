import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { staff, access, linked, orphan, mark, revalidate } = vi.hoisted(() => ({ staff: vi.fn(), access: vi.fn(), linked: vi.fn(), orphan: vi.fn(), mark: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/server/auth/staff", () => ({ tryGetOpensDoorsStaff: staff }));
vi.mock("@/server/tenant/access", () => ({ canAccessClient: access }));
vi.mock("@/server/queries/client-linked-reply-detail", () => ({ loadClientLinkedReplyDetail: linked, loadClientOrphanReplyDetail: orphan }));
vi.mock("@/server/inbox/mark-reply-handled", () => ({ markInboundReplyHandled: mark }));
vi.mock("next/cache", () => ({ revalidatePath: revalidate }));
import { POST } from "./route";

const context = { params: Promise.resolve({ clientId: "client-a", replyId: "reply-a" }) };
function request(origin = "https://outreach.example") {
  return new NextRequest("https://outreach.example/api/clients/client-a/replies/reply-a/handled", {
    method: "POST", headers: { origin, host: "outreach.example", "content-type": "application/json" },
    body: JSON.stringify({ clientId: "forged", replyId: "forged", subjectType: "INBOUND_REPLY", subjectId: "forged" }),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  staff.mockResolvedValue({ id: "staff-a", role: "USER" });
  access.mockResolvedValue(true);
  linked.mockResolvedValue({ inboundMailboxMessageId: "stored-message" });
  orphan.mockResolvedValue(null);
  mark.mockResolvedValue({ ok: true, handledByStaffUserId: "staff-a", handledAt: new Date() });
});
it("uses the URL scope and stored correlation, ignoring forged claim details", async () => {
  const response = await POST(request(), context);
  expect(await response.json()).toEqual({ ok: true, label: "Handled by you" });
  expect(mark).toHaveBeenCalledWith({ staff: { id: "staff-a", role: "USER" }, clientId: "client-a", replyId: "reply-a", subjectType: "INBOUND_MESSAGE", subjectId: "stored-message" });
  expect(response.headers.get("cache-control")).toBe("no-store");
});
it.each(["https://foreign.example", "http://outreach.example", "null", ""])("rejects invalid origin %s before authentication or mutation", async origin => {
  expect((await POST(request(origin), context)).status).toBe(403);
  expect(staff).not.toHaveBeenCalled();
  expect(mark).not.toHaveBeenCalled();
});
it("requires active staff and a currently accessible workspace", async () => {
  staff.mockResolvedValueOnce(null);
  expect((await POST(request(), context)).status).toBe(401);
  access.mockResolvedValueOnce(false);
  expect((await POST(request(), context)).status).toBe(404);
  expect(mark).not.toHaveBeenCalled();
});
it("refuses a missing or invalid linked reply instead of accepting arbitrary IDs", async () => {
  linked.mockResolvedValue(null);
  expect((await POST(request(), context)).status).toBe(404);
  expect(mark).not.toHaveBeenCalled();
});
it("resolves an orphan claim from its stored reply and preserves another handler's ownership", async () => {
  linked.mockResolvedValue(null);
  orphan.mockResolvedValue({ inboundMailboxMessageId: null });
  mark.mockResolvedValue({ ok: true, handledByStaffUserId: "staff-b" });
  expect(await (await POST(request(), context)).json()).toMatchObject({ ok: true, label: "Handled by another staff member" });
  expect(mark).toHaveBeenCalledWith(expect.objectContaining({ subjectType: "INBOUND_REPLY", subjectId: "reply-a" }));
});
it("reports an uncertain outcome if the save or subsequent invalidation fails", async () => {
  mark.mockRejectedValueOnce(new Error("connection lost"));
  expect(await (await POST(request(), context)).json()).toMatchObject({ ok: false, uncertain: true });
  revalidate.mockImplementationOnce(() => { throw new Error("invalidation failed"); });
  const response = await POST(request(), context);
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ ok: false, uncertain: true });
});
