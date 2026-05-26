import "server-only";

import {
  mailboxMicrosoftRedirectUri,
  microsoftMailboxOAuthScopes,
  microsoftMailboxOAuthTenant,
} from "@/server/mailbox/oauth-env";

export type MicrosoftMailboxAuthorizeOptions = {
  /** Hints the Microsoft sign-in screen (safe for scoped mailbox rows). */
  loginHint?: string;
  /**
   * Default `select_account` so operators can pick the correct work account and MFA
   * instead of silently reusing a cached personal session.
   */
  prompt?: "select_account" | "login" | "consent" | "none";
};

export function buildMicrosoftMailboxAuthorizeUrl(
  oauthState: string,
  options?: MicrosoftMailboxAuthorizeOptions,
): string {
  const clientId = process.env.MAILBOX_MICROSOFT_OAUTH_CLIENT_ID?.trim();
  if (!clientId) {
    throw new Error("MAILBOX_MICROSOFT_OAUTH_CLIENT_ID is not set");
  }
  const tenant = microsoftMailboxOAuthTenant();
  const redirectUri = mailboxMicrosoftRedirectUri();
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: microsoftMailboxOAuthScopes(),
    state: oauthState,
    prompt: options?.prompt ?? "select_account",
  });
  const hint = options?.loginHint?.trim();
  if (hint) {
    params.set("login_hint", hint);
  }
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params.toString()}`;
}

/**
 * Tenant-wide admin consent URL.
 *
 * Security-conscious Microsoft 365 tenants block regular users from
 * consenting to third-party apps. When the mailbox owner sees Microsoft's
 * "Need admin approval" screen, their org's IT admin must approve OpensDoors
 * once via this URL. After they accept, every mailbox in that tenant connects
 * normally. The admin lands back on the mailbox callback, which detects the
 * `admin_consent` response and shows a friendly confirmation page.
 *
 * @param emailOrDomain  A mailbox address (alex@chevronsecurity.co.uk) or a
 *                       bare domain (chevronsecurity.co.uk). The tenant is
 *                       scoped to that domain so the admin lands on their org.
 * @returns the URL, or null when the Microsoft OAuth client id is not set.
 */
export function buildMicrosoftAdminConsentUrl(
  emailOrDomain: string,
): string | null {
  const clientId = process.env.MAILBOX_MICROSOFT_OAUTH_CLIENT_ID?.trim();
  if (!clientId) return null;
  const raw = emailOrDomain.trim().toLowerCase();
  const domain = raw.includes("@") ? raw.split("@")[1]?.trim() : raw;
  const tenant = domain && domain.length > 0 ? domain : "organizations";
  const params = new URLSearchParams({
    client_id: clientId,
    scope: "https://graph.microsoft.com/.default",
    redirect_uri: mailboxMicrosoftRedirectUri(),
  });
  return `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/v2.0/adminconsent?${params.toString()}`;
}

export async function exchangeMicrosoftMailboxAuthCode(
  code: string,
): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}> {
  const clientId = process.env.MAILBOX_MICROSOFT_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.MAILBOX_MICROSOFT_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("Microsoft mailbox OAuth client is not configured");
  }
  const tenant = microsoftMailboxOAuthTenant();
  const redirectUri = mailboxMicrosoftRedirectUri();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  const res = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    },
  );
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = typeof json.error === "string" ? json.error : "token_error";
    const desc =
      typeof json.error_description === "string"
        ? json.error_description
        : JSON.stringify(json);
    throw new Error(`Microsoft token exchange failed: ${err} — ${desc}`);
  }
  const access_token = json.access_token;
  if (typeof access_token !== "string") {
    throw new Error("Microsoft token response missing access_token");
  }
  return {
    access_token,
    refresh_token: typeof json.refresh_token === "string" ? json.refresh_token : undefined,
    expires_in: typeof json.expires_in === "number" ? json.expires_in : undefined,
    scope: typeof json.scope === "string" ? json.scope : undefined,
    token_type: typeof json.token_type === "string" ? json.token_type : undefined,
  };
}

export async function fetchMicrosoftGraphPrimaryEmail(
  accessToken: string,
): Promise<{ id: string; primaryEmail: string }> {
  const res = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const graphErr = json.error as { message?: string } | undefined;
    const msg = graphErr?.message ?? JSON.stringify(json);
    throw new Error(`Microsoft Graph /me failed: ${msg}`);
  }
  const id = typeof json.id === "string" ? json.id : "";
  const mail = typeof json.mail === "string" ? json.mail : null;
  const upn =
    typeof json.userPrincipalName === "string" ? json.userPrincipalName : null;
  const primaryEmail = (mail ?? upn ?? "").trim();
  if (!id || !primaryEmail) {
    throw new Error("Microsoft Graph /me did not return id and a mailbox identifier");
  }
  return { id, primaryEmail };
}

/** Refresh delegated access for a stored Microsoft mailbox refresh token. */
export async function refreshMicrosoftMailboxAccessToken(
  refreshToken: string,
): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}> {
  const clientId = process.env.MAILBOX_MICROSOFT_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.MAILBOX_MICROSOFT_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("Microsoft mailbox OAuth client is not configured");
  }
  const tenant = microsoftMailboxOAuthTenant();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    },
  );
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = typeof json.error === "string" ? json.error : "token_error";
    const desc =
      typeof json.error_description === "string"
        ? json.error_description
        : JSON.stringify(json);
    throw new Error(`Microsoft token refresh failed: ${err} — ${desc}`);
  }
  const access_token = json.access_token;
  if (typeof access_token !== "string") {
    throw new Error("Microsoft refresh response missing access_token");
  }
  return {
    access_token,
    refresh_token: typeof json.refresh_token === "string" ? json.refresh_token : undefined,
    expires_in: typeof json.expires_in === "number" ? json.expires_in : undefined,
    scope: typeof json.scope === "string" ? json.scope : undefined,
    token_type: typeof json.token_type === "string" ? json.token_type : undefined,
  };
}
