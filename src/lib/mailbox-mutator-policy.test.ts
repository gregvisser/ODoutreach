import { describe, expect, it } from "vitest";

import { mailboxMutatorAllowedFromRoles } from "./mailbox-mutator-policy";

describe("mailboxMutatorAllowedFromRoles", () => {
  it("denies staff VIEWER", () => {
    expect(mailboxMutatorAllowedFromRoles("VIEWER", "LEAD")).toBe(false);
  });

  it("allows ADMIN regardless of membership", () => {
    expect(mailboxMutatorAllowedFromRoles("ADMIN", null)).toBe(true);
    expect(mailboxMutatorAllowedFromRoles("ADMIN", "VIEWER")).toBe(true);
  });

  it("allows MANAGER regardless of membership", () => {
    expect(mailboxMutatorAllowedFromRoles("MANAGER", null)).toBe(true);
  });

  it("allows OPERATOR only with LEAD or CONTRIBUTOR membership", () => {
    expect(mailboxMutatorAllowedFromRoles("OPERATOR", "LEAD")).toBe(true);
    expect(mailboxMutatorAllowedFromRoles("OPERATOR", "CONTRIBUTOR")).toBe(true);
    expect(mailboxMutatorAllowedFromRoles("OPERATOR", "VIEWER")).toBe(false);
    expect(mailboxMutatorAllowedFromRoles("OPERATOR", null)).toBe(false);
  });
});
