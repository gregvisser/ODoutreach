import { describe, expect, it } from "vitest";

import { resolveClientsPageEmptyCopy } from "./clients-page-empty-state";

describe("resolveClientsPageEmptyCopy", () => {
  it("returns null when the user has visible clients", () => {
    expect(
      resolveClientsPageEmptyCopy({
        listedClientCount: 1,
        totalClientsInDatabase: 5,
      }),
    ).toBeNull();
  });

  it("shows the onboarding empty state only when there are no clients at all", () => {
    expect(
      resolveClientsPageEmptyCopy({
        listedClientCount: 0,
        totalClientsInDatabase: 0,
      }),
    ).toEqual({ variant: "no_clients_in_system" });
  });

  it("returns null for an empty visible list when clients exist", () => {
    // With global access for every staff member, listedClientCount === 0 while
    // totalClientsInDatabase > 0 should not normally happen. If it ever does,
    // show no special empty copy rather than the old "no workspace assigned".
    expect(
      resolveClientsPageEmptyCopy({
        listedClientCount: 0,
        totalClientsInDatabase: 3,
      }),
    ).toBeNull();
  });
});
