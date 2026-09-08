"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { extractGoogleSpreadsheetId } from "@/lib/spreadsheet-url";
import { companySheetStatus } from "@/lib/suppression/company-sheet-status";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { requireClientAccess } from "@/server/tenant/access";
import { loadCompanySheetSource, saveCompanySheetSource } from "@/server/suppression/company-name-sheet-source";
import { syncCompanyNameSheet } from "@/server/integrations/google-sheets/company-name-sheet-sync";
import { refreshContactSuppressionFlagsForClient } from "@/server/outreach/suppression-guard";

async function actor(clientId: string) {
  const staff = await requireOpensDoorsStaff();
  await requireClientAccess(staff, clientId);
  return staff;
}
function refresh(clientId: string) {
  try { revalidatePath(`/clients/${clientId}/suppression`); } catch { /* Saved data below remains authoritative. */ }
}
const connection = z.object({ clientId: z.string().min(1), urlOrId: z.string().min(1).max(2000).refine(value => !!extractGoogleSpreadsheetId(value)), tabName: z.string().trim().min(1).max(100).refine(value => !/[\p{Cc}]/u.test(value)) });
export async function saveCompanySheetAction(input: z.infer<typeof connection>) {
  const parsed = connection.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Enter the sheet URL and tab name.", uncertain: false };
  let staff;
  try { staff = await actor(parsed.data.clientId); } catch { return { ok: false as const, error: "You cannot change this client's sheet.", uncertain: false }; }
  try {
    const source = await saveCompanySheetSource({ ...parsed.data, staffUserId: staff.id });
    refresh(parsed.data.clientId);
    return { ok: true as const, source: companySheetStatus(source), message: "Connection saved. Sync the company sheet to read its names." };
  } catch {
    return { ok: false as const, error: "We could not confirm the saved connection. Refresh its status before trying again.", uncertain: true };
  }
}
export async function syncCompanySheetAction(clientId: string) {
  let staff;
  try { staff = await actor(clientId); } catch { return { ok: false as const, error: "You cannot sync this client's sheet.", uncertain: false }; }
  try {
    const source = await loadCompanySheetSource(clientId);
    if (!source) return { ok: false as const, error: "Save a company-sheet connection first.", uncertain: false };
    const result = await syncCompanyNameSheet(source.id, staff.id);
    const saved = companySheetStatus(await loadCompanySheetSource(clientId));
    refresh(clientId);
    if (!result.ok) return { ok: false as const, error: result.error, uncertain: false, source: saved };
    let warning = "";
    try { await refreshContactSuppressionFlagsForClient(clientId); }
    catch { warning = " Sending checks are active; contact labels still need refreshing."; }
    return { ok: true as const, source: saved, message: `Sync completed: ${result.currentCount} names in the sheet; ${result.added} new blocks. ${result.retainedCount} names missing from the sheet remain blocked.${warning}` };
  } catch {
    return { ok: false as const, error: "We could not confirm the sync result. Refresh its status before trying again.", uncertain: true };
  }
}
