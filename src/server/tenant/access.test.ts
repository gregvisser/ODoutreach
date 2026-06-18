import { describe, expect, it, vi } from "vitest";

// Only LIVE (non-deleted) clients are returned by getAccessibleClientIds; the
// mock stands in for that query.
vi.mock("@/lib/db", () => ({
  prisma: {
    client: {
      findMany: vi.fn(async () => [{ id: "c1" }, { id: "c2" }]),
    },
  },
}));

import {
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
