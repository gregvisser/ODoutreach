import { beforeEach, describe, expect, it, vi } from "vitest";

import { OPENS_DOORS_PLATFORM_SUPERADMIN_EMAIL } from "@/lib/staff/opensdoors-superadmin";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    client: {
      findMany: vi.fn(),
    },
    clientMembership: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

import { canAssignClientWorkspaceMembership, getAccessibleClientIds } from "./access";

describe("canAssignClientWorkspaceMembership", () => {
  it("allows only greg@opensdoors.co.uk", () => {
    expect(
      canAssignClientWorkspaceMembership({
        id: "a",
        role: "ADMIN",
        email: OPENS_DOORS_PLATFORM_SUPERADMIN_EMAIL,
      }),
    ).toBe(true);
    expect(
      canAssignClientWorkspaceMembership({
        id: "m",
        role: "MANAGER",
        email: "joe@opensdoors.co.uk",
      }),
    ).toBe(false);
    expect(
      canAssignClientWorkspaceMembership({
        id: "o",
        role: "OPERATOR",
        email: "lucysg@opensdoors.co.uk",
      }),
    ).toBe(false);
  });
});

describe("getAccessibleClientIds", () => {
  beforeEach(() => {
    prismaMock.client.findMany.mockReset();
    prismaMock.clientMembership.findMany.mockReset();
  });

  it("returns all client ids for platform super-admin", async () => {
    prismaMock.client.findMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    const ids = await getAccessibleClientIds({
      id: "g",
      role: "ADMIN",
      email: OPENS_DOORS_PLATFORM_SUPERADMIN_EMAIL,
    });
    expect(ids).toEqual(["a", "b"]);
    expect(prismaMock.clientMembership.findMany).not.toHaveBeenCalled();
  });

  it("uses memberships only for other staff", async () => {
    prismaMock.clientMembership.findMany.mockResolvedValue([{ clientId: "x" }]);
    const ids = await getAccessibleClientIds({
      id: "j",
      role: "MANAGER",
      email: "greg@bidlow.co.uk",
    });
    expect(ids).toEqual(["x"]);
    expect(prismaMock.client.findMany).not.toHaveBeenCalled();
  });
});
