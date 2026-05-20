import "server-only";

import { loadServiceAccountCredentials } from "@/server/integrations/google-sheets/auth";

/*
 * Google does NOT expose a public API for managing OAuth consent screen test
 * users. The Cloud Console uses an internal GraphQL endpoint
 * (cloudconsole-pa.clients6.google.com) that only accepts live browser
 * sessions — it rejects service account auth (confirmed: HTTP 400, the request
 * needs session-bound values like experimentFlagsBinary/trackingId that a
 * backend cannot forge). So we link to the Console rather than automate it.
 *
 * The permanent fix is OAuth app verification + publishing, after which test
 * users are no longer required at all.
 */

/** Extracts project_id from the service account JSON (null if unavailable). */
function getProjectIdFromServiceAccount(): string | null {
  try {
    const creds = loadServiceAccountCredentials();
    const id = creds.project_id;
    return typeof id === "string" && id.trim() ? id.trim() : null;
  } catch {
    return null;
  }
}

/** Direct link to the project's OAuth consent screen test users page. */
export function getConsoleTestUsersUrl(): string {
  const projectId = getProjectIdFromServiceAccount();
  return projectId
    ? `https://console.cloud.google.com/auth/audience?project=${encodeURIComponent(projectId)}`
    : "https://console.cloud.google.com/auth/audience";
}
