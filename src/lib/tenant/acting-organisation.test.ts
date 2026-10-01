import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  chooseActingOrganisation,
  parseActingOrganisationCookie,
  type ActingMembership,
} from "./acting-organisation";

const opensDoors: ActingMembership = {
  organisationId: "org_opensdoors",
  role: "USER",
  status: "ACTIVE",
  name: "OpensDoors",
  slug: "opensdoors",
};

const papaya: ActingMembership = {
  organisationId: "org_papaya",
  role: "OWNER",
  status: "ACTIVE",
  name: "Papaya UK",
  slug: "papaya-uk",
};

describe("parseActingOrganisationCookie", () => {
  it("accepts an organisation id and rejects anything else", () => {
    expect(parseActingOrganisationCookie("org_papaya")).toBe("org_papaya");
    expect(parseActingOrganisationCookie("  org_opensdoors  ")).toBe("org_opensdoors");
    expect(parseActingOrganisationCookie("")).toBeNull();
    expect(parseActingOrganisationCookie("org papaya")).toBeNull();
    expect(parseActingOrganisationCookie("../org_papaya")).toBeNull();
    expect(parseActingOrganisationCookie("a")).toBeNull();
  });
});

describe("chooseActingOrganisation", () => {
  it("keeps the oldest membership when nobody has chosen", () => {
    expect(
      chooseActingOrganisation({
        memberships: [opensDoors, papaya],
        requestedOrganisationId: null,
        requestedOrganisation: null,
        platformAdmin: false,
      }),
    ).toMatchObject({ organisationId: "org_opensdoors", role: "USER", via: "membership" });
  });

  it("switches a member to an organisation they belong to", () => {
    expect(
      chooseActingOrganisation({
        memberships: [opensDoors, papaya],
        requestedOrganisationId: "org_papaya",
        requestedOrganisation: papaya,
        platformAdmin: false,
      }),
    ).toMatchObject({ organisationId: "org_papaya", role: "OWNER", via: "membership" });
  });

  it("ignores a request for an organisation they do not belong to", () => {
    expect(
      chooseActingOrganisation({
        memberships: [opensDoors],
        requestedOrganisationId: "org_papaya",
        requestedOrganisation: papaya,
        platformAdmin: false,
      }),
    ).toMatchObject({ organisationId: "org_opensdoors", role: "USER", via: "membership" });
  });

  it("lets a platform admin enter an organisation they have not joined, as owner", () => {
    expect(
      chooseActingOrganisation({
        memberships: [opensDoors],
        requestedOrganisationId: "org_papaya",
        requestedOrganisation: papaya,
        platformAdmin: true,
      }),
    ).toMatchObject({ organisationId: "org_papaya", role: "OWNER", via: "platform" });
  });

  it("does not invent an organisation for a platform admin", () => {
    expect(
      chooseActingOrganisation({
        memberships: [opensDoors],
        requestedOrganisationId: "org_missing",
        requestedOrganisation: null,
        platformAdmin: true,
      }),
    ).toMatchObject({ organisationId: "org_opensdoors", via: "membership" });
  });

  it("gives a platform admin owner access inside an organisation they belong to", () => {
    expect(
      chooseActingOrganisation({
        memberships: [opensDoors],
        requestedOrganisationId: "org_opensdoors",
        requestedOrganisation: opensDoors,
        platformAdmin: true,
      }),
    ).toMatchObject({ organisationId: "org_opensdoors", role: "OWNER", via: "membership" });
  });

  it("returns nothing when there is no membership and no valid entry", () => {
    expect(
      chooseActingOrganisation({
        memberships: [],
        requestedOrganisationId: null,
        requestedOrganisation: null,
        platformAdmin: true,
      }),
    ).toBeNull();
  });
});

describe("many-organisation migration", () => {
  const sql = readFileSync(
    path.join(process.cwd(), "prisma/migrations/20261001210000_staff_many_organisations/migration.sql"),
    "utf8",
  );

  it("replaces the one-membership unique index and stops the audit trigger guessing", () => {
    expect(sql).toContain('DROP INDEX IF EXISTS "OrganisationMember_staffUserId_key"');
    expect(sql).toContain('"organisationId", "staffUserId"');
    expect(sql).toContain("WHEN COUNT(*) = 1 THEN MIN");
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
  });
});
