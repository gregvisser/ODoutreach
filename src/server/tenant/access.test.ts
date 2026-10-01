import { beforeEach, describe, expect, it, vi } from "vitest";

type ClientRow = {
  id: string;
  organisationId: string;
  deletedAt: Date | null;
};

const CLIENTS: ClientRow[] = [
  { id: "c1", organisationId: "org_opensdoors", deletedAt: null },
  { id: "c2", organisationId: "org_opensdoors", deletedAt: null },
  { id: "other", organisationId: "org_other", deletedAt: null },
  { id: "deleted", organisationId: "org_opensdoors", deletedAt: new Date("2026-01-01T00:00:00.000Z") },
];

const STAFF: Record<string, { email: string; isPlatformAdmin: boolean; organisationId: string | null }> = {
  s1: { email: "ada@opensdoors.co.uk", isPlatformAdmin: false, organisationId: "org_opensdoors" },
  other: { email: "sam@northwind.example", isPlatformAdmin: false, organisationId: "org_other" },
  platform: { email: "greg@bidlow.co.uk", isPlatformAdmin: true, organisationId: "org_opensdoors" },
  flagged: { email: "ada@opensdoors.co.uk", isPlatformAdmin: true, organisationId: "org_opensdoors" },
  orphan: { email: "new@opensdoors.co.uk", isPlatformAdmin: false, organisationId: null },
};

type Where = {
  id?: string | { in: string[] };
  deletedAt?: null;
  organisationId?: string;
};

function matches(row: ClientRow, where: Where): boolean {
  if (where.deletedAt !== null) throw new Error("tenant wall dropped deletedAt");
  if (typeof where.id === "string" && row.id !== where.id) return false;
  if (where.id && typeof where.id === "object" && !where.id.in.includes(row.id)) return false;
  if (where.organisationId && row.organisationId !== where.organisationId) return false;
  if (row.deletedAt !== null) return false;
  return true;
}

const findMany = vi.fn(async ({ where }: { where: Where }) =>
  CLIENTS.filter((row) => matches(row, where)).map((row) => ({ id: row.id })),
);
const findFirst = vi.fn(async ({ where }: { where: Where }) => {
  const row = CLIENTS.find((candidate) => matches(candidate, where));
  return row ? { id: row.id } : null;
});
const findUnique = vi.fn(async ({ where }: { where: { id: string } }) => {
  const staff = STAFF[where.id];
  if (!staff) return null;
  return {
    email: staff.email,
    isPlatformAdmin: staff.isPlatformAdmin,
    organisationMembership: staff.organisationId
      ? { organisationId: staff.organisationId }
      : null,
  };
});

vi.mock("@/lib/db", () => ({
  prisma: {
    client: {
      findMany: (...args: unknown[]) => findMany(...(args as [{ where: Where }])),
      findFirst: (...args: unknown[]) => findFirst(...(args as [{ where: Where }])),
    },
    staffUser: {
      findUnique: (...args: unknown[]) => findUnique(...(args as [{ where: { id: string } }])),
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
const opensDoors = { id: "s1", role: "VIEWER" as const };

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

describe("organisation access wall", () => {
  beforeEach(() => {
    findMany.mockClear();
    findFirst.mockClear();
    findUnique.mockClear();
  });

  it("an OpensDoors user sees every live OpensDoors client and no other organisation", async () => {
    expect(await getAccessibleClientIds(opensDoors)).toEqual(["c1", "c2"]);
    await expect(requireClientAccess(opensDoors, "c1")).resolves.toBeUndefined();
    await expect(requireClientAccess(opensDoors, "c2")).resolves.toBeUndefined();
    await expect(requireClientAccess(opensDoors, "other")).rejects.toThrow("FORBIDDEN_CLIENT");
  });

  it("a second organisation sees none of OpensDoors, and OpensDoors sees none of theirs", async () => {
    const otherOrg = { id: "other", role: "OPERATOR" as const };
    expect(await getAccessibleClientIds(otherOrg)).toEqual(["other"]);
    expect(await canAccessClient(otherOrg, "c1")).toBe(false);
    expect(await canAccessClient(opensDoors, "other")).toBe(false);
  });

  it("a platform admin sees every live client, and a flagged OpensDoors email does not", async () => {
    expect(await getAccessibleClientIds({ id: "platform", role: "ADMIN" })).toEqual(["c1", "c2", "other"]);
    expect(await getAccessibleClientIds({ id: "flagged", role: "ADMIN" })).toEqual(["c1", "c2"]);
  });

  it("a staff user with no organisation sees nothing", async () => {
    expect(await getAccessibleClientIds({ id: "orphan", role: "OPERATOR" })).toEqual([]);
    expect(await canAccessClient({ id: "orphan", role: "OPERATOR" }, "c1")).toBe(false);
  });

  it("a soft-deleted workspace stays hidden", async () => {
    await expect(requireClientAccess(opensDoors, "deleted")).rejects.toThrow("FORBIDDEN_CLIENT");
    expect(await canAccessClient({ id: "platform", role: "ADMIN" }, "deleted")).toBe(false);
  });

  it("still filters on deletedAt and organisationId", async () => {
    await expect(canAccessClient(opensDoors, "c1")).resolves.toBe(true);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null, organisationId: "org_opensdoors", id: "c1" },
      }),
    );
  });

  it("does NOT read the whole client table to answer one id", async () => {
    await canAccessClient(opensDoors, "c1");
    await requireClientAccess(opensDoors, "c2");
    expect(findMany).not.toHaveBeenCalled();
    expect(findFirst).toHaveBeenCalledTimes(2);
  });

  it("rejects an empty client id without going to the database", async () => {
    expect(await canAccessClient(opensDoors, "")).toBe(false);
    expect(findFirst).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
  });
});
