import { describe, expect, it } from "vitest";

import { canAccessMailboxSetupTools } from "./mailbox-setup-access";

describe("canAccessMailboxSetupTools", () => {
  it("is available to every active staff member", () => {
    expect(canAccessMailboxSetupTools({ isSuperAdmin: true })).toBe(true);
    expect(canAccessMailboxSetupTools({ isSuperAdmin: false })).toBe(true);
  });
});
