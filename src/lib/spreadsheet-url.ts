/**
 * Extract a Google Spreadsheet document id from a pasted URL or raw id string.
 * @see https://developers.google.com/sheets/api/guides/concepts#spreadsheet_id
 */
export function extractGoogleSpreadsheetId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed) && !trimmed.includes("/")) {
    return trimmed;
  }
  try {
    const u = new URL(trimmed);
    const host = u.hostname.replace(/^www\./, "");
    if (host !== "docs.google.com") return null;
    const parts = u.pathname.split("/").filter(Boolean);
    const dIdx = parts.indexOf("d");
    if (dIdx >= 0 && parts[dIdx + 1]) {
      return parts[dIdx + 1] ?? null;
    }
  } catch {
    return null;
  }
  return null;
}
