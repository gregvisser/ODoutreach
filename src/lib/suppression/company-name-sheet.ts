import Papa from "papaparse";
import { MAX_COMPANY_IMPORT_BYTES, previewCompanyNameImport, type CompanyImportPreview } from "./company-name-import";

export const MAX_COMPANY_SHEET_ROWS = 50_000;

/** Column A is a headerless list; blank rows retain their physical row numbers. */
export function previewCompanyNameSheet(values: unknown): CompanyImportPreview {
  const refusal = (message: string): CompanyImportPreview => ({ entries: [], duplicates: 0, errors: [{ row: 0, message }] });
  if (!Array.isArray(values) || values.length > MAX_COMPANY_SHEET_ROWS) return refusal("Use a company-name sheet with at most 50,000 rows.");
  // Bound serialization and reject unexpected API shapes instead of coercing objects to names.
  let bytes = 0;
  for (const row of values) {
    if (!Array.isArray(row) || row.length > 1 || row.some(cell => typeof cell !== "string")) return refusal("Read one column containing company names as text.");
    bytes += new TextEncoder().encode(row[0] ?? "").length;
    if (bytes > MAX_COMPANY_IMPORT_BYTES) return refusal("The company-name list is too large. Use at most 1 MB.");
  }
  return previewCompanyNameImport(Papa.unparse(values.map(row => [row[0] ?? ""]), { newline: "\n" }), "csv");
}
