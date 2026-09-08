import "server-only";
import { google } from "googleapis";
import { prisma } from "@/lib/db";
import { MAX_COMPANY_SHEET_ROWS } from "@/lib/suppression/company-name-sheet";
import { applyCompanySheetRead, recordCompanySheetReadFailure } from "@/server/suppression/company-name-sheet-source";
import { loadServiceAccountCredentials } from "./auth";
import { getGoogleServiceAccountDisplayInfo } from "./service-account-display";
import { quoteSheetTitle } from "./sheet-range";
import { limitSheetsRead } from "./sheets-read-limiter";
import { formatSuppressionSyncUserError } from "./suppression-sync-errors";

/** Explicit tab + column A. No fallback to another tab and no flattened extra columns. */
export async function readCompanyNameSheet(spreadsheetId: string, tabName: string): Promise<unknown> {
  const auth = new google.auth.GoogleAuth({ credentials: loadServiceAccountCredentials(), scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] });
  const sheets = google.sheets({ version: "v4", auth });
  const metadata = await limitSheetsRead(() => sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties(title,gridProperties.rowCount)" }, { timeout: 30_000 }));
  const tab = metadata.data.sheets?.find(sheet => sheet.properties?.title === tabName)?.properties;
  if (!tab) throw Error("Invalid range: the configured company-name tab was not found.");
  const rowCount = tab.gridProperties?.rowCount;
  if (!Number.isInteger(rowCount) || !rowCount || rowCount > MAX_COMPANY_SHEET_ROWS) throw Error("Company sheet row limit exceeded");
  const response = await limitSheetsRead(() => sheets.spreadsheets.values.get({
    spreadsheetId, range: `${quoteSheetTitle(tabName)}!A:A`, majorDimension: "ROWS", valueRenderOption: "FORMATTED_VALUE",
  }, { timeout: 30_000 }));
  return response.data.values ?? [];
}

export async function syncCompanyNameSheet(sourceId: string, staffUserId: string | null = null) {
  const source = await prisma.companyDncSheetSource.findFirst({ where: { id: sourceId, client: { deletedAt: null } } });
  if (!source) return { ok: false as const, error: "Company sheet unavailable." };
  let values: unknown;
  try {
    values = await readCompanyNameSheet(source.spreadsheetId, source.tabName);
  } catch (error) {
    const raw = error instanceof Error ? error.message : "";
    const account = getGoogleServiceAccountDisplayInfo();
    const message = raw === "Company sheet row limit exceeded"
      ? "The company-name tab must have at most 50,000 rows. Existing blocks are retained."
      : raw === "Invalid range: the configured company-name tab was not found."
        ? "The saved tab was not found. Check its name in the Google Sheet."
        : /permission|forbidden|403|not found|404/i.test(raw)
          ? formatSuppressionSyncUserError(raw, account.clientEmail)
          : "The company sheet could not be read. Check the connection and try again; existing blocks are retained.";
    return recordCompanySheetReadFailure(source.id, source.revision, message);
  }
  // Persistence errors are not misreported as provider failures: the caller must
  // show an uncertain result and reload before retrying.
  return applyCompanySheetRead({ sourceId: source.id, revision: source.revision, values, staffUserId });
}
