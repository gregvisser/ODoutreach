import { beforeEach, describe, expect, it, vi } from "vitest";

const { notFound } = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/server/auth/staff", () => ({
  requireOpensDoorsStaff: vi.fn(),
}));

import { assertPlatformDashboardAccess } from "./platform-admin";

describe("platform dashboard server guard", () => {
  beforeEach(() => {
    notFound.mockClear();
  });

  it("refuses an organisation member, including one with the flag on an OpensDoors address", () => {
    expect(() =>
      assertPlatformDashboardAccess({ isPlatformAdmin: false, email: "ada@opensdoors.co.uk" }),
    ).toThrow("NEXT_NOT_FOUND");
    expect(() =>
      assertPlatformDashboardAccess({ isPlatformAdmin: true, email: "owner@opensdoors.co.uk" }),
    ).toThrow("NEXT_NOT_FOUND");
    expect(() =>
      assertPlatformDashboardAccess({ isPlatformAdmin: false, email: "greg@bidlow.co.uk" }),
    ).toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(3);
  });

  it("lets a Bidlow platform administrator through without hiding the page", () => {
    expect(() =>
      assertPlatformDashboardAccess({ isPlatformAdmin: true, email: "greg@bidlow.co.uk" }),
    ).not.toThrow();
    expect(notFound).not.toHaveBeenCalled();
  });
});
