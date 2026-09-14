import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const { save } = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@/app/(app)/clients/client-brief-actions", () => ({ saveClientBriefAction: save }));
import { POST } from "./route";
const context = { params: Promise.resolve({ clientId: "scoped-client" }) };
function request(body: unknown = {}, origin = "https://outreach.example", type = "application/json") {
  return new NextRequest("https://outreach.example/api/clients/scoped-client/brief", { method: "POST", headers: { host: "outreach.example", origin, "content-type": type }, body: JSON.stringify(body) });
}
beforeEach(() => { vi.resetAllMocks(); save.mockResolvedValue({ ok: true }); });
it("uses the URL client scope and returns plain JSON without an action identifier", async () => {
  const response = await POST(request({ clientId: "forged-client", website: "https://example.test" }), context);
  expect(await response.json()).toEqual({ ok: true });
  expect(save).toHaveBeenCalledWith({ clientId: "scoped-client", website: "https://example.test" });
});
it.each(["https://other.example", "http://outreach.example", "null", ""])("rejects cross-origin or unqualified origin %s before saving", async origin => {
  expect((await POST(request({}, origin), context)).status).toBe(403);
  expect(save).not.toHaveBeenCalled();
});
it("refuses an oversized body before invoking the save", async () => {
  expect((await POST(request({ text: "x".repeat(250001) }), context)).status).toBe(413);
  expect(save).not.toHaveBeenCalled();
});
it("does not report success when authentication or the action fails", async () => {
  save.mockRejectedValue(new Error("Unauthorised"));
  const response = await POST(request(), context);
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ ok: false, uncertain: true });
});
it("preserves a definite validation failure and marks database failure uncertain", async () => {
  save.mockResolvedValueOnce({ ok: false, error: "Invalid brief data." });
  expect((await POST(request(), context)).status).toBe(422);
  save.mockResolvedValueOnce({ ok: false, error: "Could not save brief." });
  expect(await (await POST(request(), context)).json()).toMatchObject({ ok: false, uncertain: true });
});
