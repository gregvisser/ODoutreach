import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/mailbox/oauth-env", () => ({
  microsoftMailboxOAuthTenant: () => "common",
  mailboxMicrosoftRedirectUri: () =>
    "https://opensdoors.bidlow.co.uk/api/mailbox-oauth/microsoft/callback",
  microsoftMailboxOAuthScopes: () => "openid offline_access Mail.Send",
}));

import { buildMicrosoftAdminConsentUrl } from "./microsoft-mailbox-oauth";

describe("buildMicrosoftAdminConsentUrl", () => {
  const prev = process.env.MAILBOX_MICROSOFT_OAUTH_CLIENT_ID;
  beforeEach(() => {
    process.env.MAILBOX_MICROSOFT_OAUTH_CLIENT_ID = "client-123";
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.MAILBOX_MICROSOFT_OAUTH_CLIENT_ID;
    else process.env.MAILBOX_MICROSOFT_OAUTH_CLIENT_ID = prev;
  });

  it("scopes the tenant to the email domain and uses the admin-consent endpoint", () => {
    const url = buildMicrosoftAdminConsentUrl("alex@chevronsecurity.co.uk");
    expect(url).toContain(
      "https://login.microsoftonline.com/chevronsecurity.co.uk/v2.0/adminconsent",
    );
    expect(url).toContain("client_id=client-123");
    expect(url).toContain("scope=https%3A%2F%2Fgraph.microsoft.com%2F.default");
    expect(url).toContain(
      "redirect_uri=https%3A%2F%2Fopensdoors.bidlow.co.uk%2Fapi%2Fmailbox-oauth%2Fmicrosoft%2Fcallback",
    );
  });

  it("accepts a bare domain", () => {
    expect(buildMicrosoftAdminConsentUrl("chevronsecurity.co.uk")).toContain(
      "/chevronsecurity.co.uk/v2.0/adminconsent",
    );
  });

  it("falls back to 'organizations' when no domain is present", () => {
    expect(buildMicrosoftAdminConsentUrl("")).toContain(
      "/organizations/v2.0/adminconsent",
    );
  });

  it("returns null when the OAuth client id is not configured", () => {
    delete process.env.MAILBOX_MICROSOFT_OAUTH_CLIENT_ID;
    expect(buildMicrosoftAdminConsentUrl("a@b.com")).toBeNull();
  });
});
