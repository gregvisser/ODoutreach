import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/mailbox/oauth-env", () => ({
  microsoftMailboxOAuthTenant: () => "organizations",
  mailboxMicrosoftRedirectUri: () => "https://opensdoors.bidlow.co.uk/api/mailbox-oauth/microsoft/callback",
  microsoftMailboxOAuthScopes: () => "openid offline_access Mail.Send",
  mailboxGoogleRedirectUri: () => "https://opensdoors.bidlow.co.uk/api/mailbox-oauth/google/callback",
  googleMailboxOAuthScopes: () => "openid email profile",
}));

import { buildMailboxOAuthAuthorizeUrlForPreparedState } from "./mailbox-oauth-authorize-url";

describe("buildMailboxOAuthAuthorizeUrlForPreparedState", () => {
  const prevMsId = process.env.MAILBOX_MICROSOFT_OAUTH_CLIENT_ID;
  const prevGoId = process.env.MAILBOX_GOOGLE_OAUTH_CLIENT_ID;

  beforeEach(() => {
    process.env.MAILBOX_MICROSOFT_OAUTH_CLIENT_ID = "test-ms-client";
    process.env.MAILBOX_GOOGLE_OAUTH_CLIENT_ID = "test-go-client";
  });

  afterEach(() => {
    if (prevMsId === undefined) delete process.env.MAILBOX_MICROSOFT_OAUTH_CLIENT_ID;
    else process.env.MAILBOX_MICROSOFT_OAUTH_CLIENT_ID = prevMsId;
    if (prevGoId === undefined) delete process.env.MAILBOX_GOOGLE_OAUTH_CLIENT_ID;
    else process.env.MAILBOX_GOOGLE_OAUTH_CLIENT_ID = prevGoId;
  });

  it("returns Microsoft URL with login_hint and select_account (organizations tenant)", () => {
    const url = buildMailboxOAuthAuthorizeUrlForPreparedState({
      provider: "MICROSOFT",
      oauthState: "abc123state",
      mailboxEmailNormalized: "joe@opensdoors.co.uk",
    });
    expect(url).toContain("login.microsoftonline.com/organizations/");
    expect(url).toContain("login_hint=joe%40opensdoors.co.uk");
    expect(url).toContain("prompt=select_account");
    expect(url).toContain("state=abc123state");
  });

  it("returns Google authorize URL for GOOGLE provider", () => {
    const url = buildMailboxOAuthAuthorizeUrlForPreparedState({
      provider: "GOOGLE",
      oauthState: "xyz",
      mailboxEmailNormalized: "a@b.co",
    });
    expect(url).toContain("accounts.google.com");
    expect(url).toContain("state=xyz");
  });
});
