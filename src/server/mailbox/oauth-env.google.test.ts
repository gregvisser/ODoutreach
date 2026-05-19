import { describe, expect, it } from "vitest";

import {
  GOOGLE_MAILBOX_OAUTH_SCOPES,
  GOOGLE_SCOPE_GMAIL_READONLY,
  GOOGLE_SCOPE_GMAIL_SEND,
  googleMailboxOAuthScopes,
} from "./oauth-env";

describe("googleMailboxOAuthScopes", () => {
  it("requests the exact minimal Google mailbox OAuth scopes", () => {
    const s = googleMailboxOAuthScopes();
    expect(s.split(" ")).toEqual([...GOOGLE_MAILBOX_OAUTH_SCOPES]);
    expect(GOOGLE_MAILBOX_OAUTH_SCOPES).toContain(GOOGLE_SCOPE_GMAIL_READONLY);
    expect(GOOGLE_MAILBOX_OAUTH_SCOPES).toContain(GOOGLE_SCOPE_GMAIL_SEND);
  });

  it("does not request broad Gmail mailbox access", () => {
    const s = googleMailboxOAuthScopes();
    expect(s).not.toContain("https://mail.google.com/");
    expect(s).not.toContain("https://www.googleapis.com/auth/gmail.modify");
    expect(s).not.toContain("https://www.googleapis.com/auth/gmail.compose");
  });
});
