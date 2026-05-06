import { afterEach, describe, expect, it, vi } from "vitest";

const { syncActiveClientMailboxInboxesMock } = vi.hoisted(() => ({
  syncActiveClientMailboxInboxesMock: vi.fn(),
}));

vi.mock("@/server/mailbox/mailbox-inbox-sync", () => ({
  syncActiveClientMailboxInboxes: syncActiveClientMailboxInboxesMock,
}));

import { POST } from "./route";

function req(secret: string | null, body: object = {}) {
  return new Request("https://example.test/api/internal/replies/sync", {
    method: "POST",
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
    body: JSON.stringify(body),
  });
}

describe("POST /api/internal/replies/sync", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    syncActiveClientMailboxInboxesMock.mockReset();
  });

  it("rejects when PROCESS_QUEUE_SECRET is not configured", async () => {
    vi.stubEnv("PROCESS_QUEUE_SECRET", "");

    const res = await POST(req(null) as never);

    expect(res.status).toBe(503);
    expect(syncActiveClientMailboxInboxesMock).not.toHaveBeenCalled();
  });

  it("rejects invalid bearer tokens", async () => {
    vi.stubEnv("PROCESS_QUEUE_SECRET", "correct");

    const res = await POST(req("wrong") as never);

    expect(res.status).toBe(401);
    expect(syncActiveClientMailboxInboxesMock).not.toHaveBeenCalled();
  });

  it("runs a bounded reply sync for valid internal callers", async () => {
    vi.stubEnv("PROCESS_QUEUE_SECRET", "correct");
    syncActiveClientMailboxInboxesMock.mockResolvedValue({
      processed: 1,
      succeeded: 1,
      failed: 0,
      ingested: 2,
      totalSeen: 2,
      skipped: 0,
    });

    const res = await POST(
      req("correct", { perMailboxTop: 999, maxMailboxes: 999 }) as never,
    );
    const json = (await res.json()) as { ok: boolean; processed: number };

    expect(res.status).toBe(200);
    expect(json).toMatchObject({ ok: true, processed: 1 });
    expect(syncActiveClientMailboxInboxesMock).toHaveBeenCalledWith({
      perMailboxTop: 50,
      maxMailboxes: 100,
    });
  });
});
