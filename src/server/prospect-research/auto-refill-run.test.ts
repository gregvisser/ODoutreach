import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rules: [] as unknown[],
  members: [] as { contactId: string }[],
  enrolled: 0,
  periodUsed: 0,
  runUsed: 0,
  createdRuns: [] as Record<string, unknown>[],
  ruleUpdates: [] as unknown[],
  reservations: 0,
  failClientId: null as string | null,
  sequence: null as {
    id: string;
    contactListId: string;
    contactList: { archivedAt: Date | null };
  } | null,
  plan: null as {
    id: string;
    name: string;
    maxLookups: number;
    criteria: {
      titles: string[];
      industries: string[];
      seniorities: string[];
      regions: string[];
    };
  } | null,
}));
const balance = vi.hoisted(() => vi.fn());
const execute = vi.hoisted(() => vi.fn());
const search = vi.hoisted(() => vi.fn());
const known = vi.hoisted(() => vi.fn());
const harvest = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => {
  const reservation = {
    count: async ({ where }: { where: { runId?: string } }) => (where.runId ? state.runUsed : state.periodUsed),
    findUnique: async () => null,
    create: async () => {
      state.reservations += 1;
      return { id: "res" };
    },
    updateMany: async () => ({ count: 1 }),
  };
  const tx = {
    $queryRaw: async () => [],
    rocketReachCreditReservation: reservation,
  };
  return {
    prisma: {
      $transaction: async (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx),
      sequenceListRefillRule: {
        findMany: async () => state.rules,
        update: async (args: unknown) => {
          state.ruleUpdates.push(args);
          return args;
        },
        findUnique: async () => null,
      },
      contactListMember: {
        findMany: async ({ where }: { where?: { clientId?: string } }) => {
          if (state.failClientId && where?.clientId === state.failClientId) {
            throw new Error("northwind sheet is unreadable");
          }
          return state.members;
        },
      },
      clientEmailSequenceEnrollment: { count: async () => state.enrolled },
      rocketReachCreditReservation: reservation,
      rocketReachPlanRun: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: "preview-run", ...data };
          state.createdRuns.push(row);
          return row;
        },
        update: async (args: { data: Record<string, unknown> }) => {
          state.createdRuns.push(args.data);
          return args;
        },
        findFirst: async () => null,
      },
      clientEmailSequence: { findFirst: async () => state.sequence },
      prospectResearchPlan: { findFirst: async () => state.plan },
    },
  };
});
vi.mock("@/server/integrations/rocketreach/account", () => ({ loadRocketReachCreditSnapshot: balance }));
vi.mock("@/server/integrations/rocketreach/person-import", () => ({ searchRocketReachIdentities: search }));
vi.mock("@/server/integrations/rocketreach/known-profiles", () => ({ loadKnownRocketReachIndexes: known }));
vi.mock("@/server/prospect-research/execute-plan", () => ({ executeSavedResearchPlan: execute }));
vi.mock("@/server/prospect-research/universe-harvest", () => ({
  applyUniverseHarvest: harvest,
  collectUniverseHarvest: vi.fn(async () => ({ ok: true, matches: [], skipped: {} })),
  UNIVERSE_HARVEST_BATCH: 50,
}));
vi.mock("@/server/tenant/access", () => ({ requireClientAccess: vi.fn(async () => undefined) }));

import { emptyKnownProfileIndexes } from "@/lib/clients/rocketreach-known-match";
import type { RocketReachLookupGovernor } from "@/server/integrations/rocketreach/person-import";
import { previewSequenceListTopUp, runDueRocketReachListRefills } from "./auto-refill";

const rule = {
  id: "rule-1",
  clientId: "client-1",
  planId: "plan-1",
  sequenceId: "seq-1",
  lowWaterMark: 5,
  maxCreditsPerRun: 4,
  maxCreditsPerDay: 10,
  maxCreditsPerMonth: 20,
  balanceFloor: 10,
  searchStart: 1,
  client: { status: "ACTIVE", deletedAt: null, autonomousSendEnabled: true },
  sequence: {
    id: "seq-1",
    clientId: "client-1",
    contactListId: "list-1",
    archivedAt: null,
    contactList: { archivedAt: null },
  },
  plan: { id: "plan-1", name: "Directors", clientId: "client-1" },
};

const imported = {
  ok: true,
  runId: "run-1",
  searchProfileCount: 2,
  imported: 1,
  creditsUsed: 1,
};

beforeEach(() => {
  state.rules = [rule];
  state.members = [];
  state.enrolled = 0;
  state.periodUsed = 0;
  state.runUsed = 0;
  state.createdRuns = [];
  state.ruleUpdates = [];
  state.reservations = 0;
  state.failClientId = null;
  state.sequence = {
    id: "seq-1",
    contactListId: "list-1",
    contactList: { archivedAt: null },
  };
  state.plan = {
    id: "plan-1",
    name: "Directors",
    maxLookups: 10,
    criteria: {
      titles: ["Director"],
      industries: ["Construction - General"],
      seniorities: ["Director"],
      regions: ["United Kingdom"],
    },
  };
  balance.mockReset();
  balance.mockResolvedValue({ state: "ready", remaining: 12, label: "12 credits", fetchedAt: "2026-09-29T00:00:00.000Z" });
  execute.mockReset();
  execute.mockResolvedValue(imported);
  harvest.mockReset();
  harvest.mockResolvedValue({ ok: true, added: 0, created: 0, attached: 0, matches: [], skipped: {} });
  search.mockReset();
  known.mockReset();
  known.mockResolvedValue(emptyKnownProfileIndexes());
  vi.stubEnv("ROCKETREACH_AUTO_REFILL", "true");
  vi.stubEnv("ROCKETREACH_MIN_CREDIT_FLOOR", "");
});

it("fills the list from Universe and does not call RocketReach when that closes the gap", async () => {
  harvest.mockImplementation(async () => {
    state.members = [{ contactId: "a" }, { contactId: "b" }, { contactId: "c" }, { contactId: "d" }, { contactId: "e" }];
    return { ok: true, added: 5, created: 2, attached: 3, matches: [], skipped: {} };
  });
  const result = await runDueRocketReachListRefills(new Date("2026-09-29T12:00:00.000Z"));
  expect(result).toMatchObject({ refilled: 1, failed: 0 });
  expect(execute).not.toHaveBeenCalled();
  expect(state.createdRuns.at(-1)).toMatchObject({ creditsUsed: 0, contactsAdded: 5, status: "COMPLETED" });
});

it("refills only the list and advances the search cursor when the list is below the threshold", async () => {
  const result = await runDueRocketReachListRefills(new Date("2026-09-29T12:00:00.000Z"));
  expect(result).toMatchObject({ killSwitch: "on", refilled: 1, failed: 0, skipped: 0 });
  expect(execute).toHaveBeenCalledWith(expect.objectContaining({
    staffId: null,
    existingListId: "list-1",
    trigger: "AUTO_REFILL",
    pageSize: 2,
    originNote: expect.stringMatching(/^Sourced automatically from plan Directors on /),
  }));
  expect(state.ruleUpdates.at(-1)).toMatchObject({ data: { searchStart: 3 } });
});

it("reserves budget before each lookup and stops at the balance floor", async () => {
  let governor: RocketReachLookupGovernor | undefined;
  execute.mockImplementation(async (args: { governorForRun: (runId: string) => RocketReachLookupGovernor }) => {
    governor = args.governorForRun("run-1");
    return imported;
  });
  await runDueRocketReachListRefills(new Date("2026-09-29T12:00:00.000Z"));
  expect(governor).toBeDefined();
  expect(await governor!.reserve(1)).toMatchObject({ proceed: true });
  await governor!.settle(1, "charged");
  expect(await governor!.reserve(2)).toMatchObject({ proceed: true });
  await governor!.settle(2, "charged");
  expect(await governor!.reserve(3)).toMatchObject({ proceed: false });
  expect(state.reservations).toBe(2);
});

it("does not search when the client is not on Machine sending", async () => {
  state.rules = [{ ...rule, client: { ...rule.client, autonomousSendEnabled: false } }];
  const result = await runDueRocketReachListRefills();
  expect(result.skipped).toBe(1);
  expect(execute).not.toHaveBeenCalled();
  expect(state.createdRuns[0]).toMatchObject({ status: "SKIPPED", trigger: "AUTO_REFILL" });
});

it("spends nothing when the credit balance cannot be read", async () => {
  balance.mockResolvedValue({ state: "unavailable", message: "RocketReach credit balance is unavailable." });
  const result = await runDueRocketReachListRefills();
  expect(result.skipped).toBe(1);
  expect(execute).not.toHaveBeenCalled();
});

it("treats an empty search page as a skip and restarts the cursor", async () => {
  state.rules = [{ ...rule, searchStart: 11 }];
  execute.mockResolvedValue({
    ok: true,
    runId: "run-1",
    searchProfileCount: 0,
    imported: 0,
    creditsUsed: 0,
  });
  const result = await runDueRocketReachListRefills();
  expect(result).toMatchObject({ skipped: 1, failed: 0 });
  expect(state.ruleUpdates.at(-1)).toMatchObject({ data: { searchStart: 1 } });
});

it("previews matches and estimated credits without a paid lookup", async () => {
  search.mockResolvedValue({
    ok: true,
    identities: [{
      id: 1,
      name: "Ada",
      title: "Director",
      employer: "Example",
      location: "London",
      emails: [],
      linkedinNormalized: null,
      linkedinUrl: null,
    }],
  });
  state.members = [{ contactId: "ready" }, { contactId: "ready-2" }];
  const result = await previewSequenceListTopUp(
    { id: "staff-1", role: "OPERATOR" },
    "client-1",
    "seq-1",
    "plan-1",
  );
  expect(result).toMatchObject({ ok: true, estimatedCredits: 0, alreadyKnown: 0 });
  expect(state.createdRuns[0]).toMatchObject({ trigger: "PREVIEW", creditsUsed: 0, dryRun: true });
  expect(search).toHaveBeenCalledOnce();
  const body = search.mock.calls[0]?.[0] as { query: Record<string, unknown> };
  expect(body.query).toEqual({
    current_title: ["Director"],
    company_industry: ["Construction - General"],
    location: ["United Kingdom"],
  });
  expect(body.query).not.toHaveProperty("management_levels");
});

it("keeps topping up the next organisation when the first organisation throws", async () => {
  state.failClientId = "northwind-client";
  state.rules = [
    {
      ...rule,
      id: "rule-north",
      clientId: "northwind-client",
      client: {
        ...rule.client,
        organisation: { id: "org_northwind", slug: "northwind", status: "ACTIVE" },
      },
    },
    {
      ...rule,
      id: "rule-od",
      clientId: "opensdoors-client",
      sequence: { ...rule.sequence, clientId: "opensdoors-client" },
      plan: { ...rule.plan, clientId: "opensdoors-client" },
      client: {
        ...rule.client,
        organisation: { id: "org_opensdoors", slug: "opensdoors", status: "ACTIVE" },
      },
    },
  ];
  const result = await runDueRocketReachListRefills(new Date("2026-09-29T12:00:00.000Z"));
  expect(result.failed).toBe(1);
  expect(result.refilled).toBe(1);
  expect(result.everyActiveFailed).toBe(false);
  expect(result.organisations.map((item) => item.slug)).toEqual(["northwind", "opensdoors"]);
  expect(result.organisations[0]).toMatchObject({ ok: false, disposition: "ran" });
  expect(result.organisations[1]).toMatchObject({ ok: true, disposition: "ran" });
  expect(execute).toHaveBeenCalledOnce();
  expect(execute).toHaveBeenCalledWith(expect.objectContaining({ clientId: "opensdoors-client" }));
});

it("does not spend credits for a suspended organisation", async () => {
  state.rules = [{
    ...rule,
    client: {
      ...rule.client,
      organisation: { id: "org_northwind", slug: "northwind", status: "SUSPENDED" },
    },
  }];
  const result = await runDueRocketReachListRefills(new Date("2026-09-29T12:00:00.000Z"));
  expect(execute).not.toHaveBeenCalled();
  expect(result).toMatchObject({ skipped: 1, refilled: 0, failed: 0 });
  expect(result.organisations[0]).toMatchObject({ slug: "northwind", disposition: "skipped", ok: true });
});

it("reports an empty RocketReach page as no matches and does not look anyone up", async () => {
  state.plan = {
    id: "plan-1",
    name: "Logistics",
    maxLookups: 10,
    criteria: {
      titles: ["Head of Operations"],
      industries: ["Logistics & Supply Chain - General"],
      seniorities: ["Director"],
      regions: ["United Kingdom"],
    },
  };
  search.mockResolvedValue({ ok: true, identities: [] });
  const result = await previewSequenceListTopUp(
    { id: "staff-1", role: "OPERATOR" },
    "client-1",
    "seq-1",
    "plan-1",
  );
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("expected a dry-run preview");
  expect(result.detail).toContain("RocketReach found no matches for this plan — try broader filters");
  expect(result.estimatedCredits).toBe(0);
  expect(result.matches.filter((match) => match.source === "RocketReach")).toEqual([]);
  expect(state.createdRuns[0]).toMatchObject({ trigger: "PREVIEW", creditsUsed: 0, creditsReserved: 0, dryRun: true });
  expect(search).toHaveBeenCalledOnce();
  const body = search.mock.calls[0]?.[0] as { query: Record<string, unknown> };
  expect(body.query).toEqual({
    current_title: ["Head of Operations"],
    company_industry: ["Logistics & Supply Chain - General"],
    location: ["United Kingdom"],
  });
  expect(JSON.stringify(body)).not.toMatch(/lookup/);
});
