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
    `Share as Viewer: ${serviceAccountEmail}. Open the Sheet → Share → paste this email → Viewer → Send/Share. Then click Sync again.`,
  shareSheetGeneric:
    "Share as Viewer with the Google service account email on the Suppression page or client card (Copy email). Open the Sheet → Share → paste that email → Viewer → Send/Share. Then click Sync again.",
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

/** Is this one of ours, and specifically the range one? */
export function isRangeInvalidMessage(message: string): boolean {
  return message.startsWith(SUPPRESSION_SYNC_MESSAGES.rangeInvalid);
}

/** More than this in one sentence stops being a hint and starts being a dump. */
const MAX_TABS_NAMED = 12;
/** Matches the `lastError` column budget in the sync, so nothing is truncated twice. */
const MAX_MESSAGE = 2000;

/**
 * Append the range we actually tried and the tabs the Sheet actually has.
 *
 * "Check the Sheet tab name and range (e.g. Sheet1!A:Z)" is true but unusable:
 * it asks someone to open the Sheet and compare it against a range they cannot
 * see. Both halves of that comparison are ours to state, so state them — the
 * range comes off the source row, and the titles come from a `spreadsheets.get`
 * on a Sheet we are demonstrably able to read.
 *
 * Appends; never replaces. If the tab titles could not be read, the caller gets
 * the original message back unchanged rather than a message implying we looked.
 */
export function withSheetTabNames(
  message: string,
  attemptedRange: string,
  tabTitles: readonly string[],
): string {
  const titles = tabTitles.map((t) => t.trim()).filter(Boolean);
  if (titles.length === 0) return message;

  const shown = titles.slice(0, MAX_TABS_NAMED).map((t) => `"${t}"`).join(", ");
  const more =
    titles.length > MAX_TABS_NAMED
      ? ` …and ${titles.length - MAX_TABS_NAMED} more`
      : "";

  const detail = ` We looked in ${attemptedRange}. This Sheet's tabs are: ${shown}${more}.`;
  return `${message}${detail}`.slice(0, MAX_MESSAGE);
}
