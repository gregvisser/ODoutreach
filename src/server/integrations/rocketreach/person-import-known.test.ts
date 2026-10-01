import { afterEach, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  enrichments: [] as { externalId: string; contactId: string }[],
  sources: [] as { rocketReachPersonId: string; universe: { id: string; emailNormalized: string | null; linkedinUrlNormalized: string | null; firstName: null; lastName: null; fullName: string | null; companyName: null; jobTitle: null; location: null; city: null; country: null; industry: null } }[],
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    rocketReachEnrichment: { findMany: vi.fn(async () => db.enrichments), create: vi.fn(async () => ({ id: "enr" })) },
    contactUniverseSource: { findMany: vi.fn(async () => db.sources) },
    contactUniverse: { findMany: vi.fn(async () => []) },
    client: { findUnique: vi.fn(async () => ({ organisationId: "org_opensdoors" })) },
    contact: {
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: "created-contact" })),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
  },
}));
vi.mock("@/server/contacts/contact-lists", () => ({ attachContactsToClientList: vi.fn(async () => ({ added: 1, skipped: 0 })) }));
vi.mock("@/server/contacts/contact-universe", () => ({ upsertContactUniverseAndRecordSource: vi.fn(async () => ({ universeId: "uni", created: false })) }));
vi.mock("@/server/outreach/suppression-guard", () => ({
  evaluateSuppression: vi.fn(async () => ({ suppressed: true, reason: "listed" })),
  refreshContactSuppressionFlagsForClient: vi.fn(async () => undefined),
}));
import { attachContactsToClientList } from "@/server/contacts/contact-lists";
import { evaluateSuppression } from "@/server/outreach/suppression-guard";
import { importRocketReachPeopleForClient, ROCKETREACH_API_V2_LOOKUP, ROCKETREACH_API_V2_SEARCH } from "./person-import";

const base = { clientId: "synthetic", targetListName: "Synthetic", contactListId: "list-1" };
afterEach(() => {
  db.enrichments = [];
  db.sources = [];
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

it("skips a known RocketReach profile before the paid lookup and still attaches the client contact", async () => {
  vi.stubEnv("ROCKETREACH_API_KEY", "synthetic-not-sent");
  db.enrichments = [{ externalId: "7", contactId: "already-here" }];
  const lookedUp: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url === ROCKETREACH_API_V2_SEARCH) return Response.json({ profiles: [{ id: 7, name: "Known" }, { id: 8 }] });
    lookedUp.push(url);
    return Response.json({ name: "New Person" });
  }));
  const result = await importRocketReachPeopleForClient({ ...base, searchBody: { query: { keyword: ["x"] }, page_size: 2 } });
  expect(result).toMatchObject({ ok: true, skippedAlreadyKnown: 1, lookupsAttempted: 1, creditsUsed: 0 });
  expect(lookedUp).toEqual([`${ROCKETREACH_API_V2_LOOKUP}?id=8`]);
  expect(attachContactsToClientList).toHaveBeenCalledWith(expect.objectContaining({ contactIds: ["already-here"] }));
});

it("does not create a list when the search returns nothing", async () => {
  vi.stubEnv("ROCKETREACH_API_KEY", "synthetic-not-sent");
  const ensure = vi.fn(async () => ({ id: "new-list", name: "New" }));
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ profiles: [] })));
  const result = await importRocketReachPeopleForClient({
    clientId: "synthetic",
    targetListName: "New",
    searchBody: { query: { keyword: ["x"] }, page_size: 2 },
    ensureContactList: ensure,
  });
  expect(result).toMatchObject({ ok: true, imported: 0, creditsUsed: 0, searchProfileCount: 0, contactListId: null });
  expect(ensure).not.toHaveBeenCalled();
});

it("reuses a Universe email without a lookup and still runs the suppression check", async () => {
  vi.stubEnv("ROCKETREACH_API_KEY", "synthetic-not-sent");
  db.sources = [{
    rocketReachPersonId: "9",
    universe: {
      id: "uni-9",
      emailNormalized: "known@example.test",
      linkedinUrlNormalized: null,
      firstName: null,
      lastName: null,
      fullName: "Known Person",
      companyName: null,
      jobTitle: null,
      location: null,
      city: null,
      country: null,
      industry: null,
    },
  }];
  const transport = vi.fn(async (url: string) => {
    if (url === ROCKETREACH_API_V2_SEARCH) {
      return Response.json({ profiles: [{ id: 9, linkedin_url: "https://www.linkedin.com/in/known" }] });
    }
    throw new Error(`paid lookup was not expected: ${url}`);
  });
  vi.stubGlobal("fetch", transport);
  const result = await importRocketReachPeopleForClient({
    ...base,
    searchBody: { query: { keyword: ["x"] }, page_size: 1 },
    originNote: "Sourced automatically from plan Example on 01 Oct 2026",
  });
  expect(result).toMatchObject({ ok: true, imported: 1, importedWithoutLookup: 1, creditsUsed: 0, lookupsAttempted: 0, flaggedSuppressed: 1 });
  expect(evaluateSuppression).toHaveBeenCalledWith("synthetic", "known@example.test", null);
  expect(transport).toHaveBeenCalledTimes(1);
});

it("reserves a credit before each paid lookup and stops when the budget says so", async () => {
  vi.stubEnv("ROCKETREACH_API_KEY", "synthetic-not-sent");
  const order: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url === ROCKETREACH_API_V2_SEARCH) return Response.json({ profiles: [{ id: 1 }, { id: 2 }] });
    order.push(`lookup ${url}`);
    return Response.json({ recommended_professional_email: "one@example.test", name: "One" });
  }));
  const result = await importRocketReachPeopleForClient({
    ...base,
    searchBody: { query: { keyword: ["x"] }, page_size: 2 },
    governor: {
      reserve: async (profileId) => {
        order.push(`reserve ${String(profileId)}`);
        if (profileId === 2) return { proceed: false, reason: "Daily credit budget is used." };
        return { proceed: true };
      },
      settle: async (profileId, outcome) => {
        order.push(`settle ${String(profileId)} ${outcome}`);
      },
    },
  });
  expect(result).toMatchObject({ ok: true, lookupsAttempted: 1, creditsUsed: 1 });
  expect(order[0]).toBe("reserve 1");
  expect(order[1]).toContain("lookup");
  expect(order.at(-1)).toBe("reserve 2");
  expect(result.ok && result.errors).toContain("Daily credit budget is used.");
});

it("treats an empty search page as no matches and does not call lookup", async () => {
  vi.stubEnv("ROCKETREACH_API_KEY", "synthetic-not-sent");
  const transport = vi.fn(async (url: string) => {
    expect(url).toBe(ROCKETREACH_API_V2_SEARCH);
    return Response.json({ profiles: [] });
  });
  vi.stubGlobal("fetch", transport);
  const result = await importRocketReachPeopleForClient({
    ...base,
    searchBody: { query: { current_title: ["Head of Operations"], location: ["United Kingdom"] }, page_size: 10 },
  });
  expect(result).toMatchObject({
    ok: true,
    imported: 0,
    creditsUsed: 0,
    lookupsAttempted: 0,
    searchProfileCount: 0,
  });
  expect(transport).toHaveBeenCalledTimes(1);
  expect(String(result.ok ? "" : result.error)).not.toMatch(/credit/i);
});
