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
      contactListMember: { findMany: async () => state.members },
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
  search.mockReset();
  known.mockReset();
  known.mockResolvedValue(emptyKnownProfileIndexes());
  vi.stubEnv("ROCKETREACH_AUTO_REFILL", "true");
  vi.stubEnv("ROCKETREACH_MIN_CREDIT_FLOOR", "");
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
  execute.mockResolvedValue({ ok: false, error: "RocketReach search returned no profile ids — refine the query or check API credits.", runId: "run-1" });
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
});
