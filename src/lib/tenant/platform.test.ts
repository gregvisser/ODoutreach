import { describe, expect, it } from "vitest";

import { mainNav } from "@/components/app-shell/nav-config";

import { hasPlatformAdminAccess } from "./organisation";
import {
  FIRST_ORGANISATION_ADMIN,
  ORGANISATION_FEATURE_KEYS,
  isOrganisationAdminRole,
  parseOrganisationSlug,
  platformDashboardDecision,
  postSignInPath,
  signInCallbackUrl,
  staffBlockedBySuspendedOrganisation,
  staffLandingPath,
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

describe("platform dashboard landing", () => {
  const greg = { isPlatformAdmin: true, email: "greg@bidlow.co.uk" };
  const ada = { isPlatformAdmin: false, email: "ada@opensdoors.co.uk" };
  const flaggedOpensDoors = { isPlatformAdmin: true, email: "owner@opensdoors.co.uk" };

  it("lands a Bidlow platform administrator on the platform dashboard", () => {
    expect(platformDashboardDecision(greg)).toBe("allow");
    expect(staffLandingPath(greg)).toBe("/platform");
  });

  it("lands everyone else on Reports and refuses the dashboard", () => {
    expect(platformDashboardDecision(ada)).toBe("deny");
    expect(platformDashboardDecision(flaggedOpensDoors)).toBe("deny");
    expect(staffLandingPath(ada)).toBe("/reporting");
    expect(staffLandingPath(flaggedOpensDoors)).toBe("/reporting");
    expect(staffLandingPath({ isPlatformAdmin: false, email: "greg@bidlow.co.uk" })).toBe("/reporting");
  });

  it("sends a generic sign-in home to the dashboard only for a platform administrator", () => {
    expect(postSignInPath(greg, null)).toBe("/platform");
    expect(postSignInPath(greg, "/")).toBe("/platform");
    expect(postSignInPath(greg, "/reporting")).toBe("/platform");
    expect(postSignInPath(greg, "/dashboard")).toBe("/platform");
    expect(postSignInPath(ada, "/reporting")).toBe("/reporting");
    expect(postSignInPath(ada, "/platform")).toBe("/reporting");
    expect(postSignInPath(ada, "/platform/org_north")).toBe("/reporting");
  });

  it("keeps a workspace deep link and still blocks the platform dashboard", () => {
    expect(postSignInPath(greg, "/clients/acme?tab=brief")).toBe("/clients/acme?tab=brief");
    expect(postSignInPath(ada, "/clients/acme")).toBe("/clients/acme");
    expect(postSignInPath(greg, "/platform/org_north")).toBe("/platform/org_north");
    expect(postSignInPath(greg, "//evil.example")).toBe("/platform");
    expect(postSignInPath(ada, "https://evil.example/platform")).toBe("/reporting");
  });

  it("stores a home callback until sign-in can choose the dashboard", () => {
    expect(signInCallbackUrl(null)).toBe("/");
    expect(signInCallbackUrl("/reporting")).toBe("/");
    expect(signInCallbackUrl("/platform")).toBe("/");
    expect(signInCallbackUrl("/clients/acme")).toBe("/clients/acme");
    expect(signInCallbackUrl("//evil.example")).toBe("/");
  });
});

describe("feature flag labels", () => {
  it("names every stored switch", () => {
    expect(ORGANISATION_FEATURE_KEYS).toHaveLength(8);
  });
});
