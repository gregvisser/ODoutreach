import { describe, expect, it } from "vitest";

import { OPENS_DOORS_PLATFORM_SUPERADMIN_EMAIL } from "@/lib/staff/opensdoors-superadmin";

import { canAccessMailboxSetupTools } from "./mailbox-setup-access";

describe("canAccessMailboxSetupTools", () => {
  it("allows only greg@opensdoors.co.uk", () => {
    expect(canAccessMailboxSetupTools({ email: OPENS_DOORS_PLATFORM_SUPERADMIN_EMAIL })).toBe(
      true,
    );
    expect(canAccessMailboxSetupTools({ email: "joe@opensdoors.co.uk" })).toBe(false);
    expect(canAccessMailboxSetupTools({ email: "greg@bidlow.co.uk" })).toBe(false);
  });
});
