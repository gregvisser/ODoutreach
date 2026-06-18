import { describe, expect, it } from "vitest";

import { mailboxMutatorAllowedFromRoles } from "./mailbox-mutator-policy";

const STAFF_ROLES = ["ADMIN", "MANAGER", "OPERATOR", "VIEWER"] as const;
const MEMBER_ROLES = ["LEAD", "CONTRIBUTOR", "VIEWER", null] as const;

describe("mailboxMutatorAllowedFromRoles (roles removed)", () => {
  it("allows any staff role / membership combination", () => {
    for (const staffRole of STAFF_ROLES) {
      for (const memberRole of MEMBER_ROLES) {
        expect(mailboxMutatorAllowedFromRoles(staffRole, memberRole)).toBe(true);
      }
    }
  });
});
