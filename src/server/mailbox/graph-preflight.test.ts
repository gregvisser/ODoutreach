import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { findGraphSentMessageId } from "./microsoft-graph-sendmail";

const ARGS = {
  accessToken: "t",
  mailboxUserPrincipalName: "sender@acme.com",
  to: "Prospect@Example.com",
  subject: "Quick question",
  sinceIso: "2026-06-16T00:00:00.000Z",
};

describe("findGraphSentMessageId (best-effort)", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("matches a Sent Items message by recipient (case-insensitive) and returns a prefixed id", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        value: [
          {
            id: "AAMk-1",
            toRecipients: [{ emailAddress: { address: "prospect@example.com" } }],
          },
        ],
      }),
    });
    const res = await findGraphSentMessageId(ARGS);
    expect(res).toEqual({ status: "found", providerMessageId: "msgraph:AAMk-1" });
    // filters server-side by subject + sentDateTime, scoped to SentItems
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/mailFolders/SentItems/messages");
    expect(url).toContain("sentDateTime%20ge%20");
  });

  it("returns not_found when subject matches but no recipient matches", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        value: [
          { id: "X", toRecipients: [{ emailAddress: { address: "someone-else@example.com" } }] },
        ],
      }),
    });
    expect((await findGraphSentMessageId(ARGS)).status).toBe("not_found");
  });

  it("returns not_found on an empty result set", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ value: [] }) });
    expect((await findGraphSentMessageId(ARGS)).status).toBe("not_found");
  });

  it("returns unknown on a non-OK response or thrown error", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    expect((await findGraphSentMessageId(ARGS)).status).toBe("unknown");
    fetchMock.mockRejectedValueOnce(new Error("network"));
    expect((await findGraphSentMessageId(ARGS)).status).toBe("unknown");
  });
});
