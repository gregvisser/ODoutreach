import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  hasPlatformAdminAccess,
  isBidlowPlatformEmail,
  membershipRoleForStaff,
  OPENSDOORS_FEATURE_FLAG_DEFAULTS,
  OPENSDOORS_ORGANISATION_ID,
  ORGANISATION_FEATURE_KEYS,
  resolveOrganisationFeatureFlags,
  shouldBackfillPlatformAdmin,
} from "./organisation";

describe("OpensDoors organisation defaults", () => {
  it("keeps every feature switch on, matching today's behaviour", () => {
    for (const key of ORGANISATION_FEATURE_KEYS) {
      expect(OPENSDOORS_FEATURE_FLAG_DEFAULTS[key]).toBe(true);
    }
  });

  it("treats an empty stored object as today's switches", () => {
    expect(resolveOrganisationFeatureFlags({})).toEqual(OPENSDOORS_FEATURE_FLAG_DEFAULTS);
    expect(resolveOrganisationFeatureFlags(null)).toEqual(OPENSDOORS_FEATURE_FLAG_DEFAULTS);
    expect(resolveOrganisationFeatureFlags([])).toEqual(OPENSDOORS_FEATURE_FLAG_DEFAULTS);
  });

  it("honours an explicit off and ignores junk", () => {
    expect(
      resolveOrganisationFeatureFlags({
        universe: false,
        aiCampaigns: "off",
        unknown: true,
      }),
    ).toMatchObject({
      universe: false,
      aiCampaigns: true,
      machineSending: true,
    });
  });
});

describe("platform admin predicate", () => {
  it("accepts only a Bidlow address", () => {
    expect(isBidlowPlatformEmail("Greg@Bidlow.co.uk")).toBe(true);
    expect(isBidlowPlatformEmail("staff@opensdoors.co.uk")).toBe(false);
    expect(isBidlowPlatformEmail("user@notbidlow.co.uk")).toBe(false);
    expect(isBidlowPlatformEmail("user@bidlow.co.uk.evil.com")).toBe(false);
  });

  it("requires the flag and the Bidlow domain together", () => {
    expect(hasPlatformAdminAccess({ isPlatformAdmin: true, email: "greg@bidlow.co.uk" })).toBe(true);
    expect(hasPlatformAdminAccess({ isPlatformAdmin: true, email: "ada@opensdoors.co.uk" })).toBe(false);
    expect(hasPlatformAdminAccess({ isPlatformAdmin: false, email: "greg@bidlow.co.uk" })).toBe(false);
  });

  it("backfills the flag only for an existing Bidlow super-admin", () => {
    expect(shouldBackfillPlatformAdmin({ isSuperAdmin: true, email: "greg@bidlow.co.uk" })).toBe(true);
    expect(shouldBackfillPlatformAdmin({ isSuperAdmin: true, email: "ada@opensdoors.co.uk" })).toBe(false);
    expect(shouldBackfillPlatformAdmin({ isSuperAdmin: false, email: "greg@bidlow.co.uk" })).toBe(false);
  });
});

describe("organisation membership roles", () => {
  it("maps super-admins to owner, admins to admin, and everyone else to user", () => {
    expect(membershipRoleForStaff({ isSuperAdmin: true, role: "OPERATOR" })).toBe("OWNER");
    expect(membershipRoleForStaff({ isSuperAdmin: false, role: "ADMIN" })).toBe("ADMIN");
    expect(membershipRoleForStaff({ isSuperAdmin: false, role: "MANAGER" })).toBe("USER");
    expect(membershipRoleForStaff({ isSuperAdmin: false, role: "OPERATOR" })).toBe("USER");
    expect(membershipRoleForStaff({ isSuperAdmin: false, role: "VIEWER" })).toBe("USER");
  });
});

describe("organisation migration", () => {
  const sql = readFileSync(
    path.join(process.cwd(), "prisma/migrations/20261001130000_organisation_model/migration.sql"),
    "utf8",
  );

  it("backfills every client onto the OpensDoors organisation and then requires the column", () => {
    expect(sql).toContain(OPENSDOORS_ORGANISATION_ID);
    expect(sql).toContain(`SET "organisationId" = 'org_opensdoors'`);
    expect(sql).toContain(`ALTER COLUMN "organisationId" SET NOT NULL`);
    expect(sql).toContain(`SET DEFAULT 'org_opensdoors'`);
  });

  it("is additive and idempotent", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS");
    expect(sql).toContain("ON CONFLICT");
    expect(sql).toContain("duplicate_object");
    expect(sql).not.toMatch(/\bDROP\s+(TABLE|TYPE|COLUMN)\b/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
  });
});
