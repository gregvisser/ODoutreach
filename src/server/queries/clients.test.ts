import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The /clients front door showed a "Campaigns" column that read 0 for all 17
 * live clients, because nothing in this product ever writes a `Campaign` row —
 * outreach hangs off `ClientEmailSequence`. The first screen of a client demo
 * therefore said every client had done nothing, next to a Reports page saying
 * 1,212 emails had been sent.
 *
 * These tests pin the counted relation. They mock Prisma and inspect the
 * argument the query builds, so they fail the moment the count points back at
 * the empty table.
 */

type FindManyArgs = {
  include?: { _count?: { select?: CountSelect } };
  select?: { _count?: { select?: CountSelect } };
};

// Typed through the generic (not an unused parameter) so `mock.calls` keeps the
// argument shape and the assertions below cannot drift into `any`.
const clientFindMany = vi.fn<(args: FindManyArgs) => Promise<unknown[]>>(
  async () => [],
);

vi.mock("@/lib/db", () => ({
  prisma: {
    client: {
      findMany: (args: unknown) => clientFindMany(args as FindManyArgs),
    },
  },
}));

import { listClientsForStaff, listSoftDeletedClients } from "./clients";

type CountSelect = Record<string, unknown>;

function lastCountSelect(): CountSelect {
  const call = clientFindMany.mock.calls.at(-1)?.[0];
  const select = call?.include?._count?.select ?? call?.select?._count?.select;
  if (!select) throw new Error("query did not request a _count select");
  return select;
}

beforeEach(() => {
  clientFindMany.mockClear();
});

describe("listClientsForStaff — the counts shown on /clients", () => {
  it("counts email sequences, the table outreach actually uses", async () => {
    await listClientsForStaff(["c1"]);
    expect(lastCountSelect().emailSequences).toBe(true);
  });

  it("does not count Campaign, which nothing in this product ever writes", async () => {
    await listClientsForStaff(["c1"]);
    expect(lastCountSelect()).not.toHaveProperty("campaigns");
  });

  it("still counts contacts", async () => {
    await listClientsForStaff(["c1"]);
    expect(lastCountSelect().contacts).toBe(true);
  });

  it("short-circuits without querying when staff can access nothing", async () => {
    await expect(listClientsForStaff([])).resolves.toEqual([]);
    expect(clientFindMany).not.toHaveBeenCalled();
  });
});

describe("listSoftDeletedClients — the same lie on the recovery screen", () => {
  it("counts email sequences, not Campaign", async () => {
    await listSoftDeletedClients();
    const select = lastCountSelect();
    expect(select.emailSequences).toBe(true);
    expect(select).not.toHaveProperty("campaigns");
  });
});
