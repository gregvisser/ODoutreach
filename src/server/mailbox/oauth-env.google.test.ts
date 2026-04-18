import { describe, expect, it } from "vitest";

import {
  GOOGLE_SCOPE_GMAIL_READONLY,
  GOOGLE_SCOPE_GMAIL_SEND,
  googleMailboxOAuthScopes,
} from "./oauth-env";

describe("googleMailboxOAuthScopes", () => {
  it("includes Gmail readonly and send scopes", () => {
    const s = googleMailboxOAuthScopes();
    expect(s).toContain(GOOGLE_SCOPE_GMAIL_READONLY);
    expect(s).toContain(GOOGLE_SCOPE_GMAIL_SEND);
    expect(s).toContain("openid");
    expect(s).toContain("email");
    expect(s).toContain("profile");
  });
});
