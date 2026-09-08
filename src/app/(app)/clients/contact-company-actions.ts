"use server";
import { z } from "zod";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { requireClientAccess } from "@/server/tenant/access";
import { setMissingContactCompany } from "@/server/contacts/missing-company";
import { refreshContactSuppressionFlagsForClient } from "@/server/outreach/suppression-guard";
import { loadCompanyDncPage } from "@/server/suppression/company-names";

const schema = z.object({ clientId: z.string().min(1), contactId: z.string().min(1), company: z.string().trim().min(1).max(300), page: z.number().int().min(0).max(10000), heldPage: z.number().int().min(0).max(10000) });
export async function setMissingContactCompanyAction(input: z.infer<typeof schema>) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Check the employer name and refresh this page if needed." };
  let staff;
  try { staff = await requireOpensDoorsStaff(); await requireClientAccess(staff, parsed.data.clientId); }
  catch { return { ok: false as const, error: "You cannot update this client's contacts." }; }
  const result = await setMissingContactCompany({ ...parsed.data, staffUserId: staff.id });
  if (!result.ok) return result;
  try {
    await refreshContactSuppressionFlagsForClient(parsed.data.clientId);
    const data = await loadCompanyDncPage(parsed.data.clientId, parsed.data.page, parsed.data.heldPage);
    return { ok: true as const, message: "Employer saved and do-not-contact checks refreshed. No email was approved or sent.", data };
  } catch {
    return { ok: false as const, uncertain: true as const, error: "The employer is saved, but the checks did not finish. Refresh this page, then use Refresh contact checks before continuing." };
  }
}

const refreshSchema = schema.pick({ clientId: true, page: true, heldPage: true });
export async function refreshCompanyContactChecksAction(input: z.infer<typeof refreshSchema>) {
  const parsed = refreshSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Refresh this page before checking contacts." };
  try {
    const staff = await requireOpensDoorsStaff();
    await requireClientAccess(staff, parsed.data.clientId);
    await refreshContactSuppressionFlagsForClient(parsed.data.clientId);
    return { ok: true as const, message: "Contact checks refreshed. No email was approved or sent.", data: await loadCompanyDncPage(parsed.data.clientId, parsed.data.page, parsed.data.heldPage) };
  } catch { return { ok: false as const, error: "Contact checks could not finish. Try Refresh contact checks again before continuing." }; }
}
