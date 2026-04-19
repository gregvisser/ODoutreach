/**
 * User-facing suppression sync messages. No secrets.
 */

export const SUPPRESSION_SYNC_MESSAGES = {
  adminCredentialsRequired:
    "Admin setup required: Google Sheets service account is not configured. Add GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 once in Azure App Service (application settings). Operators do not add credentials per Sheet.",
  spreadsheetMissing: "Check the Sheet URL or spreadsheet id.",
  rangeInvalid:
    "Check the Sheet tab name and range (e.g. Sheet1!A:Z). Update the range if your data is on another tab.",
  shareSheet: (serviceAccountEmail: string) =>
    `Share this Sheet with ${serviceAccountEmail} as Viewer, then try Sync again.`,
  shareSheetGeneric:
    "Share this Sheet with the Google service account email (shown on the client page) as Viewer, then try Sync again.",
  noDataInRange: "No data found in the selected range — check the tab or expand the range.",
  noValidEmails: "No valid emails found in the selected range.",
  noValidDomains: "No valid domains found in the selected range.",
} as const;

/**
 * Maps Google API / network errors to short operator-friendly text. Never logs raw credentials.
 */
export function formatSuppressionSyncUserError(
  raw: string,
  serviceAccountEmail: string | null = null,
): string {
  const msg = raw.trim();
  const lower = msg.toLowerCase();

  if (
    lower.includes("permission") ||
    lower.includes("forbidden") ||
    lower.includes("403") ||
    lower.includes("insufficient permission") ||
    lower.includes("access denied")
  ) {
    return serviceAccountEmail
      ? SUPPRESSION_SYNC_MESSAGES.shareSheet(serviceAccountEmail)
      : SUPPRESSION_SYNC_MESSAGES.shareSheetGeneric;
  }

  if (
    lower.includes("not found") ||
    lower.includes("404") ||
    lower.includes("requested entity was not found") ||
    lower.includes("invalid spreadsheet id")
  ) {
    return SUPPRESSION_SYNC_MESSAGES.spreadsheetMissing;
  }

  if (
    lower.includes("parse range") ||
    lower.includes("unable to parse") ||
    lower.includes("invalid data[") ||
    (lower.includes("bad request") && lower.includes("range"))
  ) {
    return SUPPRESSION_SYNC_MESSAGES.rangeInvalid;
  }

  if (msg.length <= 280) {
    return msg;
  }
  return `${msg.slice(0, 240)}…`;
}
