import { describe, expect, it } from "vitest";

import {
  canAccessWorkspaceAdminControls,
  isOpensDoorsSuperadminStaff,
  normalizeStaffEmailForPolicy,
  OPENS_DOORS_PLATFORM_SUPERADMIN_EMAIL,
} from "./opensdoors-superadmin";

describe("normalizeStaffEmailForPolicy", () => {
  it("never throws on missing email", () => {
    expect(normalizeStaffEmailForPolicy(undefined)).toBe("");
    expect(normalizeStaffEmailForPolicy(null)).toBe("");
  });
});

describe("isOpensDoorsSuperadminStaff", () => {
  it("is true only for greg@opensdoors.co.uk (case-insensitive)", () => {
    expect(isOpensDoorsSuperadminStaff({ email: OPENS_DOORS_PLATFORM_SUPERADMIN_EMAIL })).toBe(
      true,
    );
    expect(isOpensDoorsSuperadminStaff({ email: "  Greg@opensdoors.co.uk " })).toBe(true);
    expect(isOpensDoorsSuperadminStaff({ email: "joe@opensdoors.co.uk" })).toBe(false);
    expect(isOpensDoorsSuperadminStaff({ email: "greg@bidlow.co.uk" })).toBe(false);
  });
});

describe("canAccessWorkspaceAdminControls", () => {
  it("matches superadmin email", () => {
    expect(canAccessWorkspaceAdminControls({ email: "greg@opensdoors.co.uk" })).toBe(true);
    expect(canAccessWorkspaceAdminControls({ email: "joe@opensdoors.co.uk" })).toBe(false);
  });
});
