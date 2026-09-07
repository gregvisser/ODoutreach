import Papa from "papaparse";
import { canonicalCompanyName, MAX_COMPANY_NAME_LENGTH } from "./company-name";

export const MAX_COMPANY_IMPORT_ROWS = 5_000;
export const MAX_COMPANY_IMPORT_BYTES = 1_000_000;
export type CompanyImportPreview = {
  entries: { originalName: string; canonicalName: string }[];
  duplicates: number;
  errors: { row: number; message: string }[];
};

/**
 * A CSV has exactly one column and NO header. Plain pasted text treats each
 * line as a full name (including commas). Invalid input is never partially
 * accepted: callers must refuse saving any preview with errors.
 */
export function previewCompanyNameImport(text: string, format: "text" | "csv"): CompanyImportPreview {
  const result: CompanyImportPreview = { entries: [], duplicates: 0, errors: [] };
  if (new TextEncoder().encode(text).length > MAX_COMPANY_IMPORT_BYTES) {
    result.errors.push({ row: 0, message: "This list is too large. Import at most 1 MB at a time." });
    return result;
  }
  const input = text.replace(/^\uFEFF/u, "");
  let rows: string[][];
  if (format === "csv") {
    const parsed = Papa.parse<string[]>(input, { header: false, delimiter: ",", skipEmptyLines: false });
    rows = parsed.data;
    for (const error of parsed.errors) result.errors.push({ row: (error.row ?? 0) + 1, message: "This CSV row is not valid. Check its quotation marks." });
  } else {
    rows = input.split(/\r\n|\n|\r/u).map(line => [line]);
  }
  const names = new Set<string>();
  let nonemptyRows = 0;
  rows.forEach((cells, index) => {
    if (cells.every(cell => !cell.trim())) return;
    nonemptyRows++;
    if (nonemptyRows > MAX_COMPANY_IMPORT_ROWS) return;
    if (cells.length !== 1 || cells[0].includes("\t")) {
      result.errors.push({ row: index + 1, message: "Use one company name per row, with no extra columns." });
      return;
    }
    const originalName = cells[0].trim();
    const canonicalName = canonicalCompanyName(originalName);
    if (!canonicalName || canonicalName.length > MAX_COMPANY_NAME_LENGTH || originalName.length > MAX_COMPANY_NAME_LENGTH || /[\r\n\p{Cc}]/u.test(originalName)) {
      result.errors.push({ row: index + 1, message: "Enter a company name of up to 300 characters on one line." });
      return;
    }
    if (names.has(canonicalName)) { result.duplicates++; return; }
    names.add(canonicalName);
    result.entries.push({ originalName, canonicalName });
  });
  if (nonemptyRows > MAX_COMPANY_IMPORT_ROWS) result.errors.push({ row: 0, message: "Import at most 5,000 company names at a time." });
  if (!nonemptyRows) result.errors.push({ row: 0, message: "Enter at least one company name." });
  return result;
}
