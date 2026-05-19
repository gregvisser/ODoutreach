import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {},
}));

import { canAssignClientWorkspaceMembership } from "./access";

describe("canAssignClientWorkspaceMembership", () => {
  it("allows ADMIN and MANAGER", () => {
    expect(
      canAssignClientWorkspaceMembership({ id: "a", role: "ADMIN" }),
    ).toBe(true);
    expect(
      canAssignClientWorkspaceMembership({ id: "m", role: "MANAGER" }),
    ).toBe(true);
  });

  it("denies OPERATOR and VIEWER", () => {
    expect(
      canAssignClientWorkspaceMembership({ id: "o", role: "OPERATOR" }),
    ).toBe(false);
    expect(
      canAssignClientWorkspaceMembership({ id: "v", role: "VIEWER" }),
    ).toBe(false);
  });
});
