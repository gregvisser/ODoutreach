import { afterEach, describe, expect, it, vi } from "vitest";
import { listMicrosoftGraphInboxMessages } from "./microsoft-graph-inbox";
import { fetchGmailInboxMessagesForSync, listGmailInboxMessageRefs } from "./gmail-inbox";

const graphPage = "https://graph.microsoft.com/v1.0/users/sender%40example.test/mailFolders/inbox/messages?$skip=25";
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
afterEach(() => vi.unstubAllGlobals());

describe("inbox continuation", () => {
  it("reads Graph continuation verbatim and deduplicates overlapping pages", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response({ value: [{ id: "first" }], "@odata.nextLink": graphPage }))
      .mockResolvedValueOnce(response({ value: [{ id: "first" }, { id: "older-reply" }] }));
    vi.stubGlobal("fetch", fetcher);
    expect(await listMicrosoftGraphInboxMessages("token", "sender@example.test")).toEqual([{ id: "first" }, { id: "older-reply" }]);
    expect(fetcher.mock.calls[1][0]).toBe(graphPage);
    expect(fetcher.mock.calls[1][1]).toMatchObject({ redirect: "error", headers: { Authorization: "Bearer token" } });
  });
  it.each(["https://evil.example/inbox", "https://graph.microsoft.com/v1.0/users/another/messages"])("rejects unsafe Graph continuation %s before another request", async (next) => {
    const fetcher = vi.fn().mockResolvedValue(response({ value: [], "@odata.nextLink": next }));
    vi.stubGlobal("fetch", fetcher);
    await expect(listMicrosoftGraphInboxMessages("token", "sender@example.test")).rejects.toThrow("unsafe");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("reports a later Graph failure and successfully restarts on retry", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response({ value: [{ id: "first" }], "@odata.nextLink": graphPage }))
      .mockResolvedValueOnce(response({ error: { message: "Unavailable" } }, 503));
    vi.stubGlobal("fetch", fetcher);
    await expect(listMicrosoftGraphInboxMessages("token", "sender@example.test")).rejects.toThrow("Unavailable");
    fetcher.mockResolvedValueOnce(response({ value: [{ id: "first" }], "@odata.nextLink": graphPage }))
      .mockResolvedValueOnce(response({ value: [{ id: "older" }] }));
    expect(await listMicrosoftGraphInboxMessages("token", "sender@example.test")).toHaveLength(2);
  });
  it("rejects a Graph continuation cycle", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => response({ value: [], "@odata.nextLink": graphPage })));
    await expect(listMicrosoftGraphInboxMessages("token", "sender@example.test")).rejects.toThrow("did not complete");
  });
  it("rejects malformed Graph pages rather than claiming an empty inbox", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({})));
    await expect(listMicrosoftGraphInboxMessages("token", "sender@example.test")).rejects.toThrow("invalid message page");
  });
  it("follows Gmail tokens through empty pages and fetches the older full reply", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response({ messages: [{ id: "first" }], nextPageToken: "opaque +/& token" }))
      .mockResolvedValueOnce(response({ nextPageToken: "third" }))
      .mockResolvedValueOnce(response({ messages: [{ id: "first" }, { id: "older" }] }))
      .mockResolvedValueOnce(response({ id: "first", payload: { headers: [{ name: "From", value: "p@example.test" }] } }))
      .mockResolvedValueOnce(response({ id: "older", payload: { mimeType: "text/plain", headers: [{ name: "From", value: "p@example.test" }, { name: "In-Reply-To", value: "<original>" }], body: { data: Buffer.from("STOP").toString("base64url") } } }));
    vi.stubGlobal("fetch", fetcher);
    const rows = await fetchGmailInboxMessagesForSync("token");
    expect(rows.map(r => r.providerMessageId)).toEqual(["first", "older"]);
    expect(rows[1].fullBody?.bodyText).toBe("STOP");
    expect(new URL(fetcher.mock.calls[1][0]).searchParams.get("pageToken")).toBe("opaque +/& token");
    expect(fetcher).toHaveBeenCalledTimes(5);
  });
  it("does not return partial Gmail results after a later failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response({ messages: [{ id: "first" }], nextPageToken: "next" }))
      .mockResolvedValueOnce(response({ error: { message: "Rate limited" } }, 429)));
    await expect(listGmailInboxMessageRefs("token")).rejects.toThrow("Rate limited");
  });
  it("rejects repeated Gmail continuation tokens", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => response({ nextPageToken: "same" })));
    await expect(listGmailInboxMessageRefs("token")).rejects.toThrow("did not complete");
  });
});
