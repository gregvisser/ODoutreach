import { describe, expect, it } from "vitest";

import { canAccessMailboxSetupTools } from "@/lib/mailboxes/mailbox-setup-access";
import {
  canAccessWorkspaceAdminControls,
  isOpensDoorsSuperadminStaff,
} from "@/lib/staff/opensdoors-superadmin";

describe("client overview — operator vs Greg policy", () => {
  it("does not treat typical operators as workspace admins", () => {
    expect(canAccessWorkspaceAdminControls({ email: "joe@opensdoors.co.uk" })).toBe(false);
    expect(canAccessWorkspaceAdminControls({ email: "lucysg@opensdoors.co.uk" })).toBe(false);
    expect(canAccessWorkspaceAdminControls({ email: "greg@bidlow.co.uk" })).toBe(false);
  });

  it("treats missing email as non-superadmin without throwing", () => {
    expect(isOpensDoorsSuperadminStaff({})).toBe(false);
    expect(canAccessWorkspaceAdminControls({})).toBe(false);
    expect(canAccessMailboxSetupTools({})).toBe(false);
  });
});
