import "server-only";

import { google } from "googleapis";

import { loadServiceAccountCredentials } from "@/server/integrations/google-sheets/auth";

const CLIENTAUTHCONFIG_BASE = "https://clientauthconfig.googleapis.com/v2";
const CLOUD_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

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

type Brand = { name: string; applicationTitle?: string };

async function discoverBrandName(
  projectId: string,
  token: string,
): Promise<string> {
  const res = await fetch(
    `${CLIENTAUTHCONFIG_BASE}/projects/${encodeURIComponent(projectId)}/brands`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Could not list OAuth brands for project "${projectId}" ` +
        `(HTTP ${res.status}). Ensure the service account has the ` +
        `"OAuth Config Editor" (roles/clientauthconfig.editor) IAM role. ` +
        `API response: ${body.slice(0, 400)}`,
    );
  }
  const data = (await res.json()) as { brands?: Brand[] };
  const brand = data.brands?.[0];
  if (!brand?.name) {
    throw new Error(
      `No OAuth consent screen brand found in project "${projectId}". ` +
        "Set up the OAuth consent screen in Google Cloud Console first.",
    );
  }
  return brand.name; // e.g. "projects/123/brands/456"
}

export type TestUsersAddResult = {
  added: string[];
  alreadyPresent: string[];
  total: number;
};

/**
 * Adds emails as test users on the Google OAuth consent screen for the project
 * associated with the configured service account.
 *
 * Requires the service account to hold roles/clientauthconfig.editor on the GCP project.
 */
export async function addGoogleOauthTestUsers(
  emails: string[],
): Promise<TestUsersAddResult> {
  if (emails.length === 0) {
    return { added: [], alreadyPresent: [], total: 0 };
  }

  const projectId = getProjectIdFromServiceAccount();
  const token = await getAccessToken();
  const brandName = await discoverBrandName(projectId, token);

  // Fetch current test users to avoid false-positive "already added" on re-runs.
  let existing: string[] = [];
  try {
    const listRes = await fetch(
      `${CLIENTAUTHCONFIG_BASE}/${brandName}/testUsers`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (listRes.ok) {
      const listData = (await listRes.json()) as {
        testUsers?: { username: string }[];
      };
      existing = (listData.testUsers ?? []).map((u) =>
        u.username.toLowerCase().trim(),
      );
    }
  } catch {
    // Non-fatal: if list fails, we'll just try to add all of them.
  }

  const normalised = emails.map((e) => e.toLowerCase().trim()).filter(Boolean);
  const alreadyPresent = normalised.filter((e) => existing.includes(e));
  const toAdd = normalised.filter((e) => !existing.includes(e));

  if (toAdd.length === 0) {
    return { added: [], alreadyPresent, total: existing.length };
  }

  const addRes = await fetch(
    `${CLIENTAUTHCONFIG_BASE}/${brandName}:addTestUsers`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ testUsers: toAdd }),
    },
  );

  if (!addRes.ok) {
    const body = await addRes.text();
    throw new Error(
      `Failed to add test users to OAuth brand "${brandName}" ` +
        `(HTTP ${addRes.status}). ` +
        `Confirm the service account has the "OAuth Config Editor" role. ` +
        `API response: ${body.slice(0, 400)}`,
    );
  }

  return {
    added: toAdd,
    alreadyPresent,
    total: existing.length + toAdd.length,
  };
}

/** Lists current test users for the project's OAuth consent screen. */
export async function listGoogleOauthTestUsers(): Promise<string[]> {
  const projectId = getProjectIdFromServiceAccount();
  const token = await getAccessToken();
  const brandName = await discoverBrandName(projectId, token);

  const res = await fetch(
    `${CLIENTAUTHCONFIG_BASE}/${brandName}/testUsers`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Failed to list test users (HTTP ${res.status}): ${body.slice(0, 300)}`,
    );
  }
  const data = (await res.json()) as { testUsers?: { username: string }[] };
  return (data.testUsers ?? []).map((u) => u.username.trim());
}
