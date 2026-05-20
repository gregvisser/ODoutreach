import "server-only";

import { google } from "googleapis";

import { loadServiceAccountCredentials } from "@/server/integrations/google-sheets/auth";

/*
 * Google does NOT expose a public REST API for managing OAuth consent screen
 * test users. The Cloud Console uses an internal GraphQL endpoint at
 * cloudconsole-pa.clients6.google.com. This module attempts to call that
 * endpoint with a service account Bearer token. If it rejects SA auth, the
 * caller falls back to a direct Console link.
 *
 * Discovered via Chrome DevTools (May 2026). The query signature and endpoint
 * may change with Console releases — treat failures as expected and degrade
 * gracefully to the manual Console link.
 */

const CONSOLE_GRAPHQL_URL =
  "https://cloudconsole-pa.clients6.google.com/v3/entityServices/OauthEntityService/schemas/OAUTH_GRAPHQL:batchGraphql";
const CONSOLE_API_KEY = "AIzaSyCI-zsRP85UVOi0DjtiCwWBwQ1djDy741g";
const CLOUD_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

// Pre-compiled query signatures used by the Console (May 2026 build).
const SET_TRUSTED_USERS_SIG =
  "2/7gA8JWHyqFx3hPWBgvLvbsZAwIBEI2HTpajRUpYPVZM=";

async function getAccessToken(): Promise<string> {
  const auth = new google.auth.GoogleAuth({
    credentials: loadServiceAccountCredentials(),
    scopes: [CLOUD_SCOPE],
  });
  const client = await auth.getClient();
  const res = await client.getAccessToken();
  if (!res.token) {
    throw new Error("Service account access token was empty.");
  }
  return res.token;
}

/** Extracts project_id from the service account JSON. */
export function getProjectIdFromServiceAccount(): string {
  const creds = loadServiceAccountCredentials();
  const id = creds.project_id;
  if (typeof id !== "string" || !id.trim()) {
    throw new Error(
      "project_id not found in service account JSON. " +
        "Ensure the service account was created with a project and the full key JSON was exported.",
    );
  }
  return id.trim();
}

/** Resolves project ID → numeric project number via Cloud Resource Manager. */
async function getProjectNumber(
  projectId: string,
  token: string,
): Promise<string> {
  const res = await fetch(
    `https://cloudresourcemanager.googleapis.com/v3/projects/${encodeURIComponent(projectId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Could not resolve project number for "${projectId}" (HTTP ${res.status}): ${body.slice(0, 300)}`,
    );
  }
  const data = (await res.json()) as { name?: string };
  // data.name is "projects/452662141668"
  const num = data.name?.replace("projects/", "");
  if (!num) {
    throw new Error("Project number not found in Cloud Resource Manager response.");
  }
  return num;
}

/** Build the direct Console link for the fallback UX. */
export function getConsoleTestUsersUrl(): string {
  try {
    const projectId = getProjectIdFromServiceAccount();
    return `https://console.cloud.google.com/auth/audience?project=${encodeURIComponent(projectId)}`;
  } catch {
    return "https://console.cloud.google.com/auth/audience";
  }
}

export type TestUsersAddResult = {
  added: string[];
  alreadyPresent: string[];
  total: number;
};

/**
 * Attempts to set the OAuth consent screen test user list via the Cloud
 * Console's internal GraphQL endpoint. The operation is a full SET
 * (replaces the entire list), so the caller MUST provide the complete
 * desired list — not just the additions.
 *
 * @param fullList - The complete list of test user emails (existing + new).
 * @returns void on success, throws on failure.
 */
async function callSetTrustedUserList(
  projectId: string,
  projectNumber: string,
  fullList: string[],
  token: string,
): Promise<void> {
  const res = await fetch(
    `${CONSOLE_GRAPHQL_URL}?key=${CONSOLE_API_KEY}&prettyPrint=false`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        operationName: "SetTrustedUserList",
        querySignature: SET_TRUSTED_USERS_SIG,
        variables: {
          projectNumber,
          trustedUserList: fullList,
        },
        requestContext: {
          platformMetadata: { platformType: "RIF" },
          projectId,
          selectedPurview: { projectId },
        },
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `SetTrustedUserList failed (HTTP ${res.status}). ` +
        `This internal Console API may not accept service account auth. ` +
        `Response: ${body.slice(0, 400)}`,
    );
  }

  // Check for GraphQL-level errors in the response body.
  const data = (await res.json()) as { errors?: { message: string }[] };
  if (data.errors?.length) {
    throw new Error(
      `SetTrustedUserList GraphQL error: ${data.errors[0].message}`,
    );
  }
}

/**
 * Adds emails as test users on the Google OAuth consent screen.
 *
 * Attempts the internal Console GraphQL API first. If that fails (e.g. SA
 * auth rejected), the error message includes a direct Console link so the
 * admin can add them manually.
 *
 * @param emails      New emails to add.
 * @param currentList The current full list of test users (caller-provided,
 *                    since there is no reliable list API). New emails are
 *                    merged into this list before the SET call.
 */
export async function addGoogleOauthTestUsers(
  emails: string[],
  currentList: string[],
): Promise<TestUsersAddResult> {
  if (emails.length === 0) {
    return { added: [], alreadyPresent: [], total: currentList.length };
  }

  const projectId = getProjectIdFromServiceAccount();
  const token = await getAccessToken();
  const projectNumber = await getProjectNumber(projectId, token);

  const normalised = emails.map((e) => e.toLowerCase().trim()).filter(Boolean);
  const currentLower = new Set(currentList.map((e) => e.toLowerCase().trim()));
  const alreadyPresent = normalised.filter((e) => currentLower.has(e));
  const toAdd = normalised.filter((e) => !currentLower.has(e));

  if (toAdd.length === 0) {
    return { added: [], alreadyPresent, total: currentList.length };
  }

  const fullList = [...currentList, ...toAdd];

  const consoleUrl = getConsoleTestUsersUrl();
  try {
    await callSetTrustedUserList(projectId, projectNumber, fullList, token);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Could not add test users automatically. ${detail}\n\n` +
        `Add them manually in Google Cloud Console:\n${consoleUrl}`,
    );
  }

  return {
    added: toAdd,
    alreadyPresent,
    total: fullList.length,
  };
}

/**
 * Lists current test users. There is no public API for this — the function
 * throws with a Console link so the caller can guide the admin.
 */
export async function listGoogleOauthTestUsers(): Promise<string[]> {
  throw new Error(
    "Google does not provide a public API to list OAuth test users. " +
      `View them in Google Cloud Console: ${getConsoleTestUsersUrl()}`,
  );
}
