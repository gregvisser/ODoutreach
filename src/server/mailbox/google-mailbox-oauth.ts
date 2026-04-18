import "server-only";

import {
  googleMailboxOAuthScopes,
  mailboxGoogleRedirectUri,
} from "@/server/mailbox/oauth-env";

export function buildGoogleMailboxAuthorizeUrl(oauthState: string): string {
  const clientId = process.env.MAILBOX_GOOGLE_OAUTH_CLIENT_ID?.trim();
  if (!clientId) {
    throw new Error("MAILBOX_GOOGLE_OAUTH_CLIENT_ID is not set");
  }
  const redirectUri = mailboxGoogleRedirectUri();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: googleMailboxOAuthScopes(),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: oauthState,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleMailboxAuthCode(
  code: string,
): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}> {
  const clientId = process.env.MAILBOX_GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.MAILBOX_GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("Google mailbox OAuth client is not configured");
  }
  const redirectUri = mailboxGoogleRedirectUri();
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = typeof json.error === "string" ? json.error : "token_error";
    const desc =
      typeof json.error_description === "string"
        ? json.error_description
        : JSON.stringify(json);
    throw new Error(`Google token exchange failed: ${err} — ${desc}`);
  }
  const access_token = json.access_token;
  if (typeof access_token !== "string") {
    throw new Error("Google token response missing access_token");
  }
  return {
    access_token,
    refresh_token: typeof json.refresh_token === "string" ? json.refresh_token : undefined,
    expires_in: typeof json.expires_in === "number" ? json.expires_in : undefined,
    scope: typeof json.scope === "string" ? json.scope : undefined,
  };
}

export async function fetchGoogleUserEmailAndSub(
  accessToken: string,
): Promise<{ sub: string; email: string }> {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`Google userinfo failed: ${JSON.stringify(json)}`);
  }
  const sub = typeof json.sub === "string" ? json.sub : "";
  const email = typeof json.email === "string" ? json.email : "";
  if (!sub || !email) {
    throw new Error("Google userinfo did not return sub and email");
  }
  return { sub, email };
}

/** Refresh delegated access for a stored Google mailbox refresh token. */
export async function refreshGoogleMailboxAccessToken(
  refreshToken: string,
): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}> {
  const clientId = process.env.MAILBOX_GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.MAILBOX_GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("Google mailbox OAuth client is not configured");
  }
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = typeof json.error === "string" ? json.error : "token_error";
    const desc =
      typeof json.error_description === "string"
        ? json.error_description
        : JSON.stringify(json);
    throw new Error(`Google token refresh failed: ${err} — ${desc}`);
  }
  const access_token = json.access_token;
  if (typeof access_token !== "string") {
    throw new Error("Google refresh response missing access_token");
  }
  return {
    access_token,
    refresh_token: typeof json.refresh_token === "string" ? json.refresh_token : undefined,
    expires_in: typeof json.expires_in === "number" ? json.expires_in : undefined,
    scope: typeof json.scope === "string" ? json.scope : undefined,
  };
}
