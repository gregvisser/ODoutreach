import { afterEach, expect, it, vi } from "vitest";
import { resolveGraphMessageId } from "./resolve-graph-message-id";

const message = { providerMessageId: "original-id", metadata: { internetMessageId: "<test'quote@example.test>", graphMessageId: "stale-id" },
  fromEmail: "prospect@example.test", receivedAt: new Date("2026-09-16T09:00Z") };
const input = { message, accessToken: "synthetic", mailboxUserPrincipalName: "own/mailbox@example.test" };
const candidate = { id: "moved-id", internetMessageId: "<test'quote@example.test>",
  from: { emailAddress: { address: "Prospect@Example.test" } }, receivedDateTime: message.receivedAt.toISOString() };
afterEach(() => vi.unstubAllGlobals());
function respond(body: unknown, status = 200) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
}

it("resolves a moved locator with an escaped mailbox-scoped GET, never a POST", async () => {
  respond({ value: [candidate] });
  expect(await resolveGraphMessageId(input)).toBe("moved-id");
  const [url, options] = vi.mocked(fetch).mock.calls[0];
  const parsed = new URL(String(url));
  expect(parsed.origin).toBe("https://graph.microsoft.com");
  expect(parsed.pathname).toBe("/v1.0/users/own%2Fmailbox%40example.test/messages");
  expect(parsed.searchParams.get("$filter")).toBe("internetMessageId eq '<test''quote@example.test>'");
  expect(options).toMatchObject({ redirect: "error", headers: { Authorization: "Bearer synthetic" } });
  expect(options?.method).toBeUndefined();
});

it.each([
  { value: [] }, { value: [candidate, candidate] },
  { value: [{ ...candidate, internetMessageId: "<different@example.test>" }] },
  { value: [{ ...candidate, from: { emailAddress: { address: "someone-else@example.test" } } }] },
  { value: [{ ...candidate, receivedDateTime: "2026-09-16T09:00:01Z" }] },
  { value: [candidate], "@odata.nextLink": "https://evil.example/steal" },
  { malformed: true },
])("rejects missing, mismatched or ambiguous identity without following provider URLs", async body => {
  respond(body);
  await expect(resolveGraphMessageId(input)).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("fails closed on provider read failure", async () => {
  respond({}, 503);
  await expect(resolveGraphMessageId(input)).rejects.toThrow("could not verify");
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("keeps legacy IDs and trusted locators usable when no Internet Message-ID exists", async () => {
  respond({});
  expect(await resolveGraphMessageId({ ...input, message: { ...message, metadata: null } })).toBe("original-id");
  expect(await resolveGraphMessageId({ ...input, message: { ...message, metadata: { graphMessageId: "current-id" } } })).toBe("current-id");
  expect(fetch).not.toHaveBeenCalled();
});
