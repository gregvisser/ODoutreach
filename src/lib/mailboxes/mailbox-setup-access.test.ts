import { describe, expect, it } from "vitest";

import { canAccessMailboxSetupTools } from "./mailbox-setup-access";

describe("canAccessMailboxSetupTools", () => {
  it("allows ADMIN and MANAGER", () => {
    expect(canAccessMailboxSetupTools("ADMIN")).toBe(true);
    expect(canAccessMailboxSetupTools("MANAGER")).toBe(true);
  });

  it("denies operators and viewers", () => {
    expect(canAccessMailboxSetupTools("OPERATOR")).toBe(false);
    expect(canAccessMailboxSetupTools("VIEWER")).toBe(false);
  });
});
