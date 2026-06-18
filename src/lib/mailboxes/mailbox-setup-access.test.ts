import { describe, expect, it } from "vitest";

import { canAccessMailboxSetupTools } from "./mailbox-setup-access";

describe("canAccessMailboxSetupTools", () => {
  it("allows the owner account (super-admin)", () => {
    expect(canAccessMailboxSetupTools({ isSuperAdmin: true })).toBe(true);
  });

  it("denies non-owner staff", () => {
    expect(canAccessMailboxSetupTools({ isSuperAdmin: false })).toBe(false);
  });
});
