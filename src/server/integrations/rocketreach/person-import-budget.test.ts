import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/server/contacts/contact-lists", () => ({ attachContactsToClientList: vi.fn() }));
vi.mock("@/server/contacts/contact-universe", () => ({ upsertContactUniverseAndRecordSource: vi.fn() }));
vi.mock("@/server/outreach/suppression-guard", () => ({ evaluateSuppression: vi.fn(), refreshContactSuppressionFlagsForClient: vi.fn() }));
import { importRocketReachPeopleForClient, ROCKETREACH_API_V2_SEARCH } from "./person-import";
const base = { clientId: "synthetic", contactListId: "synthetic-list", targetListName: "Synthetic" };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it.each([0, -1, 1.5, "5", Infinity, NaN])("rejects invalid batch size %s before any provider request", async page_size => {
  vi.stubEnv("ROCKETREACH_API_KEY", "synthetic-not-sent");
  const transport = vi.fn();
  vi.stubGlobal("fetch", transport);
  expect(await importRocketReachPeopleForClient({ ...base, searchBody: { query: {}, page_size } })).toMatchObject({ ok: false });
  expect(transport).not.toHaveBeenCalled();
});
it.each([{ requested: 2, expected: 2 }, { requested: 100, expected: 10 }, { requested: undefined, expected: 10 }])("bounds search and lookup requests to $expected for requested $requested", async ({ requested, expected }) => {
  vi.stubEnv("ROCKETREACH_API_KEY", "synthetic-not-sent");
  const lookedUp: string[] = [];
  const transport = vi.fn(async (url: string, options?: RequestInit) => {
    if (url === ROCKETREACH_API_V2_SEARCH) {
      expect(JSON.parse(String(options?.body)).page_size).toBe(expected);
      return Response.json({ profiles: [null, { id: 0 }, { id: 1.5 }, { id: 1 }, { id: 1 }, ...Array.from({ length: 20 }, (_, i) => ({ id: i + 2 }))] });
    }
    lookedUp.push(url);
    // No email means no contact writes; all transport remains inert.
    return Response.json({ name: "Synthetic" });
  });
  vi.stubGlobal("fetch", transport);
  await importRocketReachPeopleForClient({ ...base, searchBody: { query: {}, page_size: requested } });
  expect(lookedUp).toHaveLength(expected);
  expect(new Set(lookedUp).size).toBe(expected);
  expect(lookedUp[0]).toContain("?id=1");
});
