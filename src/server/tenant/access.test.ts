import { beforeEach, describe, expect, it, vi } from "vitest";

// Only LIVE (non-deleted) clients are visible. c1 and c2 are live; anything else
// is soft-deleted or non-existent. The mock stands in for BOTH query shapes —
// the list form and the single-row form — and `findFirst` honours the `where`
// it is given, so a test cannot pass by the helper simply ignoring the filter.
const LIVE_CLIENT_IDS = ["c1", "c2"];

const findMany = vi.fn(async () => LIVE_CLIENT_IDS.map((id) => ({ id })));
const findFirst = vi.fn(
  async ({ where }: { where: { id?: string; deletedAt?: null } }) => {
    if (where.deletedAt !== null) throw new Error("tenant wall dropped deletedAt");
    return where.id && LIVE_CLIENT_IDS.includes(where.id) ? { id: where.id } : null;
  },
);

vi.mock("@/lib/db", () => ({
  prisma: {
    client: {
      findMany: (...args: unknown[]) => findMany(...(args as [])),
      findFirst: (...args: unknown[]) =>
        findFirst(...(args as unknown as [{ where: { id?: string; deletedAt?: null } }])),
    },
  },
}));

import {
  canAccessClient,
  canAssignClientWorkspaceMembership,
  canDeleteWorkspace,
  canUseCooldownReengage,
  getAccessibleClientIds,
  requireClientAccess,
} from "./access";

const ROLES = ["ADMIN", "MANAGER", "OPERATOR", "VIEWER"] as const;

describe("in-account roles removed — capabilities open to any active staff", () => {
  it("canAssignClientWorkspaceMembership is true for every role", () => {
    for (const role of ROLES) {
      expect(canAssignClientWorkspaceMembership({ id: "s", role })).toBe(true);
    }
  });

  it("canUseCooldownReengage is true for every role", () => {
    for (const role of ROLES) {
      expect(canUseCooldownReengage({ id: "s", role })).toBe(true);
    }
  });
});

describe("canDeleteWorkspace (F2 — still capability-gated, unchanged)", () => {
  it("allows only a super-admin", () => {
    expect(canDeleteWorkspace({ isSuperAdmin: true })).toBe(true);
    expect(canDeleteWorkspace({ isSuperAdmin: false })).toBe(false);
  });
});

describe("tenant isolation still holds after role removal", () => {
  // role is irrelevant now — use the most-restricted historical role to prove it.
  const anyStaff = { id: "s1", role: "VIEWER" as const };

  it("every staff member can access every LIVE client", async () => {
    expect(await getAccessibleClientIds(anyStaff)).toEqual(["c1", "c2"]);
    await expect(requireClientAccess(anyStaff, "c1")).resolves.toBeUndefined();
    await expect(requireClientAccess(anyStaff, "c2")).resolves.toBeUndefined();
  });

  it("a client that is NOT live (soft-deleted or non-existent) is still rejected", async () => {
    // c3 is not in the live set → the wall rejects it for everyone.
    await expect(requireClientAccess(anyStaff, "c3")).rejects.toThrow(
      "FORBIDDEN_CLIENT",
    );
  });
});

/**
 * Queue item 3 — `requireClientAccess` used to answer "may I touch this ONE
 * client?" by reading EVERY live client row and comparing in JavaScript, on
 * every server action and every workspace page. It now asks about the single
 * indexed row. These lock in that it still gives the SAME answers, and that the
 * whole-table read is genuinely gone rather than merely moved.
 */
describe("canAccessClient — same wall, one row instead of the whole table", () => {
  const anyStaff = { id: "s1", role: "VIEWER" as const };

  beforeEach(() => {
    findMany.mockClear();
    findFirst.mockClear();
  });

  it("agrees with getAccessibleClientIds on every id, live and not", async () => {
    const live = await getAccessibleClientIds(anyStaff);
    for (const id of [...LIVE_CLIENT_IDS, "c3", "deleted-workspace"]) {
      expect(await canAccessClient(anyStaff, id)).toBe(live.includes(id));
    }
  });

  it("still filters on deletedAt — the tenant wall, not just the id", async () => {
    // findFirst throws if `deletedAt: null` is missing from the where clause,
    // so a helper that looked up by id alone would fail here rather than pass.
    await expect(canAccessClient(anyStaff, "c1")).resolves.toBe(true);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null, id: "c1" } }),
    );
  });

  it("does NOT read the whole client table", async () => {
    await canAccessClient(anyStaff, "c1");
    await requireClientAccess(anyStaff, "c2");
    expect(findMany).not.toHaveBeenCalled();
    expect(findFirst).toHaveBeenCalledTimes(2);
  });

  it("rejects an empty client id without going to the database", async () => {
    expect(await canAccessClient(anyStaff, "")).toBe(false);
    expect(findFirst).not.toHaveBeenCalled();
  });
});
