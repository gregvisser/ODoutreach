import { describe, expect, it } from "vitest";

import { mainNav } from "@/components/app-shell/nav-config";

import { hasPlatformAdminAccess } from "./organisation";
import {
  FIRST_ORGANISATION_ADMIN,
  ORGANISATION_FEATURE_KEYS,
  isOrganisationAdminRole,
  parseOrganisationSlug,
  staffBlockedBySuspendedOrganisation,
} from "./platform";

describe("organisation slug", () => {
  it("accepts a lowercase slug and rejects everything else", () => {
    expect(parseOrganisationSlug(" Northwind ")).toBe("northwind");
    expect(parseOrganisationSlug("north-wind-2")).toBe("north-wind-2");
    expect(parseOrganisationSlug("a")).toBeNull();
    expect(parseOrganisationSlug("ab")).toBe("ab");
    expect(parseOrganisationSlug("a".repeat(41))).toBeNull();
    expect(parseOrganisationSlug("-north")).toBeNull();
    expect(parseOrganisationSlug("north-")).toBeNull();
    expect(parseOrganisationSlug("north--wind")).toBeNull();
    expect(parseOrganisationSlug("North Wind")).toBeNull();
    expect(parseOrganisationSlug("opensdoors.co.uk")).toBeNull();
  });
});

describe("platform console access", () => {
  it("keeps the platform route out of the shared navigation", () => {
    expect(mainNav.map((item) => item.href)).not.toContain("/platform");
  });

  it("refuses an OpensDoors address even when the platform flag is set", () => {
    expect(
      hasPlatformAdminAccess({
        isPlatformAdmin: true,
        email: "owner@opensdoors.co.uk",
      }),
    ).toBe(false);
  });

  it("does not make the first organisation admin a platform or super admin", () => {
    expect(FIRST_ORGANISATION_ADMIN).toEqual({
      staffRole: "ADMIN",
      membershipRole: "OWNER",
      isPlatformAdmin: false,
      isSuperAdmin: false,
    });
  });

  it("treats owners and admins as organisation managers", () => {
    expect(isOrganisationAdminRole("OWNER")).toBe(true);
    expect(isOrganisationAdminRole("ADMIN")).toBe(true);
    expect(isOrganisationAdminRole("USER")).toBe(false);
    expect(isOrganisationAdminRole(null)).toBe(false);
  });
});

describe("suspended organisation", () => {
  it("blocks ordinary staff and leaves a Bidlow platform admin in", () => {
    expect(
      staffBlockedBySuspendedOrganisation({
        isPlatformAdmin: false,
        email: "ada@northwind.example",
        organisationStatus: "SUSPENDED",
      }),
    ).toBe(true);
    expect(
      staffBlockedBySuspendedOrganisation({
        isPlatformAdmin: true,
        email: "owner@opensdoors.co.uk",
        organisationStatus: "SUSPENDED",
      }),
    ).toBe(true);
    expect(
      staffBlockedBySuspendedOrganisation({
        isPlatformAdmin: true,
        email: "greg@bidlow.co.uk",
        organisationStatus: "SUSPENDED",
      }),
    ).toBe(false);
    expect(
      staffBlockedBySuspendedOrganisation({
        isPlatformAdmin: false,
        email: "ada@opensdoors.co.uk",
        organisationStatus: "ACTIVE",
      }),
    ).toBe(false);
    expect(
      staffBlockedBySuspendedOrganisation({
        isPlatformAdmin: false,
        email: "ada@opensdoors.co.uk",
        organisationStatus: null,
      }),
    ).toBe(false);
  });
});

describe("feature flag labels", () => {
  it("names every stored switch", () => {
    expect(ORGANISATION_FEATURE_KEYS).toHaveLength(8);
  });
});
