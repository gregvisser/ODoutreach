import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/mailbox/oauth-env", () => ({
  microsoftMailboxOAuthTenant: () => "common",
  mailboxMicrosoftRedirectUri: () => "https://example.test/oauth/ms",
  microsoftMailboxOAuthScopes: () => "openid offline_access Mail.Send",
}));

import { buildMicrosoftMailboxAuthorizeUrl } from "./microsoft-mailbox-oauth";

describe("buildMicrosoftMailboxAuthorizeUrl", () => {
  const prev = process.env.MAILBOX_MICROSOFT_OAUTH_CLIENT_ID;

  beforeEach(() => {
    process.env.MAILBOX_MICROSOFT_OAUTH_CLIENT_ID = "test-ms-client";
  });

  afterEach(() => {
    if (prev === undefined) {
      delete process.env.MAILBOX_MICROSOFT_OAUTH_CLIENT_ID;
    } else {
      process.env.MAILBOX_MICROSOFT_OAUTH_CLIENT_ID = prev;
    }
  });

  it("includes login_hint and select_account for reconnect guidance", () => {
    const url = buildMicrosoftMailboxAuthorizeUrl("state-token-abc", {
      loginHint: "joe@opensdoors.co.uk",
      prompt: "select_account",
    });
    expect(url).toContain("login_hint=joe%40opensdoors.co.uk");
    expect(url).toContain("prompt=select_account");
    expect(url).toContain("state=state-token-abc");
  });
});
