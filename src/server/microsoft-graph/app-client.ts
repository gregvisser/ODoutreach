import "server-only";

import { getTenantIdFromEntraIssuer } from "@/lib/entra-tenant";

/**
 * App-only access token for Microsoft Graph (client credentials).
 * Requires the same Entra app registration as Auth.js, with **Application** permissions
 * granted admin consent (e.g. User.Invite.All, User.Read.All).
 */
export async function getGraphAppOnlyAccessToken(): Promise<string> {
  const issuer = process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER;
  const tenantId =
    process.env.AUTH_TENANT_ID?.trim() || getTenantIdFromEntraIssuer(issuer);
  const clientId = process.env.AUTH_MICROSOFT_ENTRA_ID_ID?.trim();
  const clientSecret = process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET?.trim();

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      "Graph app token: set AUTH_MICROSOFT_ENTRA_ID_ISSUER (or AUTH_TENANT_ID), AUTH_MICROSOFT_ENTRA_ID_ID, AUTH_MICROSOFT_ENTRA_ID_SECRET",
    );
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph token request failed (${res.status}): ${text}`);
  }

  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new Error("Graph token response missing access_token");
  }
  return json.access_token;
}

export async function graphFetch(
  path: string,
  options: {
    method?: string;
    jsonBody?: unknown;
    headers?: HeadersInit;
  } = {},
): Promise<Response> {
  const token = await getGraphAppOnlyAccessToken();
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${token}`);
  let body: BodyInit | undefined;
  if (options.jsonBody !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.jsonBody);
  }
  return fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method: options.method ?? "GET",
    headers,
    body,
  });
}
