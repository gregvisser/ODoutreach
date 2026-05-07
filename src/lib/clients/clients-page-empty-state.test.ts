import { describe, expect, it } from "vitest";

import { resolveClientsPageEmptyCopy } from "./clients-page-empty-state";

describe("resolveClientsPageEmptyCopy", () => {
  it("returns null when the user has visible clients", () => {
    expect(
      resolveClientsPageEmptyCopy({
        staffRole: "OPERATOR",
        listedClientCount: 1,
        totalClientsInDatabase: 5,
      }),
    ).toBeNull();
  });

  it("treats admin empty list as no workspaces only when DB count is zero", () => {
    expect(
      resolveClientsPageEmptyCopy({
        staffRole: "ADMIN",
        listedClientCount: 0,
        totalClientsInDatabase: 0,
      }),
    ).toEqual({ variant: "no_clients_in_system" });
    expect(
      resolveClientsPageEmptyCopy({
        staffRole: "ADMIN",
        listedClientCount: 0,
        totalClientsInDatabase: 3,
      }),
    ).toBeNull();
  });

  it("shows assignment guidance for operator when workspaces exist but none are assigned", () => {
    expect(
      resolveClientsPageEmptyCopy({
        staffRole: "OPERATOR",
        listedClientCount: 0,
        totalClientsInDatabase: 2,
      }),
    ).toEqual({ variant: "no_workspace_assigned" });
  });

  it("shows onboarding empty state for operator when no workspaces exist yet", () => {
    expect(
      resolveClientsPageEmptyCopy({
        staffRole: "OPERATOR",
        listedClientCount: 0,
        totalClientsInDatabase: 0,
      }),
    ).toEqual({ variant: "no_clients_in_system" });
  });

  it("matches viewer role to operator rules", () => {
    expect(
      resolveClientsPageEmptyCopy({
        staffRole: "VIEWER",
        listedClientCount: 0,
        totalClientsInDatabase: 1,
      }),
    ).toEqual({ variant: "no_workspace_assigned" });
  });
});
