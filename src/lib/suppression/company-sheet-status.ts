import type { CompanyDncSheetSource } from "@/generated/prisma/client";

export type CompanySheetStatus = Pick<CompanyDncSheetSource, "id" | "spreadsheetId" | "tabName" | "revision" | "lastSuccessAt" | "lastError" | "retainedCount"> & { currentCount: number };
/** Browser confirmations need counts and connection details, not every stored name. */
export function companySheetStatus(source: CompanyDncSheetSource | null): CompanySheetStatus | null {
  if (!source) return null;
  return { id: source.id, spreadsheetId: source.spreadsheetId, tabName: source.tabName, revision: source.revision, lastSuccessAt: source.lastSuccessAt, lastError: source.lastError, retainedCount: source.retainedCount, currentCount: source.currentNames.length };
}
