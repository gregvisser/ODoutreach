"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { requireClientAccess } from "@/server/tenant/access";
import { getClientEmailSequenceMutationAllowed } from "@/server/email-sequences/mutator-access";
import { addCompanyNames, decideCompanyName } from "@/server/suppression/company-names";
import { evaluateSuppression, refreshContactSuppressionFlagsForClient } from "@/server/outreach/suppression-guard";
import { operatorRequeueFailedSend } from "@/server/email/outbound/operator-recovery";

async function authorisedStaff(clientId: string) {
  const staff = await requireOpensDoorsStaff();
  await requireClientAccess(staff, clientId);
  if (!(await getClientEmailSequenceMutationAllowed(staff, clientId))) throw Error("Access denied");
  return staff;
}
function refreshPages(clientId: string) {
  revalidatePath(`/clients/${clientId}/suppression`);
  revalidatePath(`/clients/${clientId}/contacts`);
  revalidatePath("/activity");
}
const importSchema = z.object({ clientId: z.string().min(1), text: z.string().max(1_000_000), format: z.enum(["text", "csv"]) });
export async function importCompanyDncAction(input: z.infer<typeof importSchema>) {
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Check the company list and try again." };
  let staff;
  try { staff = await authorisedStaff(parsed.data.clientId); } catch { return { ok: false as const, error: "You cannot change this client's list." }; }
  const result = await addCompanyNames({ ...parsed.data, staffUserId: staff.id });
  if (!result.ok) return { ok: false as const, error: result.errors.map(error => `Row ${error.row}: ${error.message}`).slice(0, 10).join(" ") };
  let warning = "";
  try { await refreshContactSuppressionFlagsForClient(input.clientId); }
  catch { warning = " The list is saved and sending checks are active, but contact labels could not finish refreshing."; }
  refreshPages(input.clientId);
  return { ok: true as const, message: `Added ${result.added} company names. ${result.duplicates} already listed or repeated.${warning}` };
}

const reviewSchema = z.object({ clientId: z.string().min(1), contactId: z.string().min(1), company: z.string().min(1).max(300), entryId: z.string().min(1), outcome: z.enum(["ALLOW", "BLOCK"]) });
export async function reviewCompanyDncAction(input: z.infer<typeof reviewSchema>) {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "That review is not valid. Refresh the page." };
  let staff;
  try { staff = await authorisedStaff(input.clientId); } catch { return { ok: false as const, error: "You cannot review this client's list." }; }
  const contact = await prisma.contact.findFirst({ where: { id: input.contactId, clientId: input.clientId, company: input.company }, select: { id: true } });
  if (!contact) return { ok: false as const, error: "The contact's company has changed or is unavailable. Refresh before reviewing." };
  const result = await decideCompanyName({ ...parsed.data, staffUserId: staff.id });
  if (!result.ok) return result;
  let warning = "";
  try { await refreshContactSuppressionFlagsForClient(input.clientId); }
  catch { warning = " Contact labels still need refreshing; sending checks use your saved decision."; }
  refreshPages(input.clientId);
  return { ok: true as const, message: `Review saved. Existing email and domain blocks still apply.${warning}` };
}

const retrySchema = z.object({ clientId: z.string().min(1), outboundEmailId: z.string().min(1) });
export async function retryCompanyDncHoldAction(input: z.infer<typeof retrySchema>) {
  const parsed = retrySchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "That held email is not valid." };
  try { await authorisedStaff(input.clientId); } catch { return { ok: false as const, error: "You cannot retry this client's email." }; }
  const row = await prisma.outboundEmail.findFirst({ where: { id: input.outboundEmailId, clientId: input.clientId, status: "FAILED", lastErrorCode: "COMPANY_REVIEW", providerMessageId: null, dispatchStartedAt: null }, select: { toEmail: true } });
  if (!row) return { ok: false as const, error: "That email is no longer held for company review." };
  if ((await evaluateSuppression(input.clientId, row.toEmail)).suppressed) return { ok: false as const, error: "This recipient is still blocked or needs review. Resolve that first." };
  const result = await operatorRequeueFailedSend(input.outboundEmailId, input.clientId, "COMPANY_REVIEW");
  refreshPages(input.clientId);
  return result.count ? { ok: true as const, message: "Email queued again. Current sending limits and all blocking checks still apply." } : { ok: false as const, error: result.error ?? "The email changed. Refresh before trying again." };
}
