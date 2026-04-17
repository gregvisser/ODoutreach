import { describe, expect, it } from "vitest";

import {
  assertAtLeastOneOtherActiveAdmin,
  assertNotSelfDeactivationFromStaffScreen,
  isLastActiveAdminRemovalAttempt,
} from "./last-admin-policy";

describe("assertNotSelfDeactivationFromStaffScreen", () => {
  it("blocks self-deactivation", () => {
    expect(() =>
      assertNotSelfDeactivationFromStaffScreen({
        actorStaffUserId: "a",
        targetStaffUserId: "a",
        nextActive: false,
      }),
    ).toThrow(/cannot deactivate your own account/i);
  });

  it("allows deactivating another user", () => {
    expect(() =>
      assertNotSelfDeactivationFromStaffScreen({
        actorStaffUserId: "a",
        targetStaffUserId: "b",
        nextActive: false,
      }),
    ).not.toThrow();
  });
});

describe("isLastActiveAdminRemovalAttempt", () => {
  it("is true when demoting an active admin", () => {
    expect(
      isLastActiveAdminRemovalAttempt(
        { role: "ADMIN", isActive: true },
        "OPERATOR",
        undefined,
      ),
    ).toBe(true);
  });

  it("is false when role unchanged", () => {
    expect(
      isLastActiveAdminRemovalAttempt({ role: "ADMIN", isActive: true }, "ADMIN", undefined),
    ).toBe(false);
  });

  it("is true when deactivating an active admin", () => {
    expect(
      isLastActiveAdminRemovalAttempt(
        { role: "ADMIN", isActive: true },
        undefined,
        false,
      ),
    ).toBe(true);
  });

  it("is false for inactive admin demotion edge (not an active admin removal)", () => {
    expect(
      isLastActiveAdminRemovalAttempt(
        { role: "ADMIN", isActive: false },
        "OPERATOR",
        undefined,
      ),
    ).toBe(false);
  });
});

describe("assertAtLeastOneOtherActiveAdmin", () => {
  it("throws when only one active admin", () => {
    expect(() => assertAtLeastOneOtherActiveAdmin(1)).toThrow(/last active administrator/i);
  });

  it("allows when two or more active admins", () => {
    expect(() => assertAtLeastOneOtherActiveAdmin(2)).not.toThrow();
  });
});
