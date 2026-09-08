import { beforeEach, afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ sources: vi.fn(), sync: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { companyDncSheetSource: { findMany: m.sources } } }));
vi.mock("@/server/integrations/google-sheets/company-name-sheet-sync", () => ({ syncCompanyNameSheet: m.sync }));
import { POST } from "./route";
const request = (body: object, secret = "synthetic") => new Request("https://example.test/api/internal/company-name-sheets/v1", { method: "POST", headers: { authorization: `Bearer ${secret}` }, body: JSON.stringify(body) });
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("PROCESS_QUEUE_SECRET", "synthetic"); m.sources.mockResolvedValue([{ id: "source" }]); m.sync.mockResolvedValue({ ok: true, added: 1 }); });
afterEach(() => vi.unstubAllEnvs());
it("rejects wrong credentials and unversioned work", async () => {
  expect((await POST(request({ protocol: 1 }, "wrong") as never)).status).toBe(401);
  expect((await POST(request({}) as never)).status).toBe(409);
  expect(m.sources).not.toHaveBeenCalled(); expect(m.sync).not.toHaveBeenCalled();
});
it("returns a bounded live-client plan without synchronizing", async () => {
  expect(await (await POST(request({ protocol: 1, planOnly: true }) as never)).json()).toEqual({ protocol: 1, ok: true, sourceIds: ["source"] });
  expect(m.sources).toHaveBeenCalledWith(expect.objectContaining({ where: { client: { deletedAt: null } }, take: 1001 }));
  expect(m.sync).not.toHaveBeenCalled();
});
it("keeps failed and uncertain syncs unsuccessful", async () => {
  m.sync.mockResolvedValue({ ok: false, error: "Read refused" });
  const response = await POST(request({ protocol: 1, sourceId: "source" }) as never);
  expect(response.status).toBe(207); expect(await response.json()).toMatchObject({ ok: false });
  m.sync.mockRejectedValue(Error("private internal error"));
  const failed = await POST(request({ protocol: 1, sourceId: "source" }) as never);
  expect(failed.status).toBe(500); expect(JSON.stringify(await failed.json())).not.toContain("private");
});
