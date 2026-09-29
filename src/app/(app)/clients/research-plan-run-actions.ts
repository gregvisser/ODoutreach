"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  ROCKETREACH_IMPORT_CONFIRMATION_PHRASE,
  isRocketReachImportConfirmationValid,
} from "@/lib/clients/rocketreach-import-safety";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { executeSavedResearchPlan } from "@/server/prospect-research/execute-plan";
import { requireClientAccess } from "@/server/tenant/access";

const inputSchema = z.object({
  clientId: z.string().min(1),
  planId: z.string().min(1),
  existingListId: z.string().optional(),
  newListName: z.string().optional(),
  confirmationPhrase: z.string().optional(),
});

export async function runResearchPlanIntoListAction(input: z.infer<typeof inputSchema>) {
  const staff = await requireOpensDoorsStaff();
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Check the plan and the list." };
  if (!isRocketReachImportConfirmationValid(parsed.data.confirmationPhrase ?? "")) {
    return {
      ok: false as const,
      error: `Type ${ROCKETREACH_IMPORT_CONFIRMATION_PHRASE} before running this plan. It uses the same RocketReach credits as a manual search.`,
    };
  }
  try {
    await requireClientAccess(staff, parsed.data.clientId);
  } catch {
    return { ok: false as const, error: "Access denied." };
  }
  const result = await executeSavedResearchPlan({
    clientId: parsed.data.clientId,
    planId: parsed.data.planId,
    staffId: staff.id,
    existingListId: parsed.data.existingListId,
    newListName: parsed.data.newListName,
    trigger: "MANUAL",
  });
  if (result.ok) {
    revalidatePath(`/clients/${parsed.data.clientId}/sources`);
    revalidatePath(`/clients/${parsed.data.clientId}`);
    revalidatePath("/contacts");
    revalidatePath("/universe");
  }
  if (!result.ok) return { ok: false as const, error: result.error };
  return {
    ok: true as const,
    imported: result.imported,
    contactListName: result.contactListName,
    creditsUsed: result.creditsUsed,
    skippedAlreadyKnown: result.skippedAlreadyKnown,
    skippedNoEmail: result.skippedNoEmail,
    skippedInvalid: result.skippedInvalid,
    skippedDuplicate: result.skippedDuplicate,
  };
}
