import { beforeEach, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  plan: null as { id: string; maxLookups: number; criteria: unknown } | null,
  updates: [] as unknown[],
}));
const importer = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({
  prisma: {
    prospectResearchPlan: { findFirst: async () => db.plan },
    rocketReachPlanRun: {
      create: async ({ data }: { data: Record<string, unknown> }) => ({ id: "run-1", ...data }),
      update: async (args: unknown) => {
        db.updates.push(args);
        return args;
      },
    },
  },
}));
vi.mock("@/server/integrations/rocketreach/run-import", () => ({
  runRocketReachListImport: importer,
}));

import { executeSavedResearchPlan } from "./execute-plan";

const criteria = {
  titles: ["Head of Procurement"],
  industries: ["Construction - General"],
  seniorities: ["Director"],
  regions: ["United Kingdom"],
};

const imported = {
  ok: true as const,
  imported: 1,
  importedWithoutLookup: 0,
  skippedNoEmail: 0,
  skippedInvalid: 0,
  skippedDuplicate: 0,
  skippedAlreadyKnown: 2,
  flaggedSuppressed: 0,
  creditsUsed: 1,
  lookupsAttempted: 1,
  searchProfileCount: 1,
  errors: [],
  contactListId: "list-1",
  contactListName: "Directors",
  listAttachedAdded: 1,
  listAttachedSkipped: 0,
  universeCreated: 1,
  universeMatched: 0,
};

beforeEach(() => {
  db.plan = { id: "plan-1", maxLookups: 10, criteria };
  db.updates = [];
  importer.mockReset();
  importer.mockResolvedValue(imported);
});

it("runs the saved plan through the existing import and records who, credits, and skips", async () => {
  const result = await executeSavedResearchPlan({
    clientId: "client-1",
    planId: "plan-1",
    staffId: "staff-1",
    existingListId: "list-1",
    trigger: "MANUAL",
  });
  expect(result.ok).toBe(true);
  expect(importer).toHaveBeenCalledWith(expect.objectContaining({
    staffId: "staff-1",
    existingListId: "list-1",
    searchBody: {
      query: {
        current_title: ["Head of Procurement"],
        company_industry: ["Construction - General"],
        location: ["United Kingdom"],
      },
      page_size: 10,
      start: 1,
      order_by: "relevance",
    },
  }));
  expect(db.updates.at(-1)).toMatchObject({
    data: { status: "COMPLETED", creditsUsed: 1, contactsAdded: 1, contactListId: "list-1" },
  });
});

it("passes a null staff id for automatic top-up so list membership is not tied to a fake user", async () => {
  await executeSavedResearchPlan({
    clientId: "client-1",
    planId: "plan-1",
    staffId: null,
    existingListId: "list-1",
    trigger: "AUTO_REFILL",
    sequenceId: "seq-1",
    pageSize: 2,
  });
  expect(importer).toHaveBeenCalledWith(expect.objectContaining({ staffId: null }));
});

it("records a failed run when the plan targeting cannot be searched", async () => {
  db.plan = { id: "plan-1", maxLookups: 10, criteria: { ...criteria, industries: ["Not real"] } };
  const result = await executeSavedResearchPlan({
    clientId: "client-1",
    planId: "plan-1",
    staffId: "staff-1",
    trigger: "MANUAL",
  });
  expect(result.ok).toBe(false);
  expect(importer).not.toHaveBeenCalled();
  expect(db.updates.at(-1)).toMatchObject({ data: { status: "FAILED" } });
});

it("marks the run failed when the import throws, instead of leaving it running", async () => {
  importer.mockRejectedValue(new Error("lookup store unavailable"));
  const result = await executeSavedResearchPlan({
    clientId: "client-1",
    planId: "plan-1",
    staffId: null,
    existingListId: "list-1",
    trigger: "AUTO_REFILL",
  });
  expect(result).toMatchObject({ ok: false, runId: "run-1" });
  expect(db.updates.at(-1)).toMatchObject({ data: { status: "FAILED", detail: "lookup store unavailable" } });
});
