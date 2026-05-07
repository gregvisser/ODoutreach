import { describe, expect, it } from "vitest";

import { formatMicrosoftMailboxOAuthAccountMismatch } from "./microsoft-oauth-account-mismatch";

describe("formatMicrosoftMailboxOAuthAccountMismatch", () => {
  it("includes both emails", () => {
    expect(
      formatMicrosoftMailboxOAuthAccountMismatch(
        "admin@tenant.onmicrosoft.com",
        "joe@opensdoors.co.uk",
      ),
    ).toContain("admin@tenant.onmicrosoft.com");
    expect(
      formatMicrosoftMailboxOAuthAccountMismatch(
        "admin@tenant.onmicrosoft.com",
        "joe@opensdoors.co.uk",
      ),
    ).toContain("joe@opensdoors.co.uk");
  });
});
