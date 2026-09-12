"use server";
import { revalidatePath } from "next/cache";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { saveResearchPlan } from "@/server/prospect-research/plans";
import { researchPlanSchema } from "@/lib/prospect-research/qualification";
export async function saveResearchPlanAction(clientId: string, input: unknown) {
  const staff = await requireOpensDoorsStaff();
  const parsed = researchPlanSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Complete all four targeting fields and choose a whole-number lookup limit from 1 to 100." };
  try {
    await saveResearchPlan(staff, clientId, parsed.data);
    revalidatePath(`/clients/${clientId}/sources`);
    return { ok: true };
  } catch {
    return { ok: false, error: "The research plan could not be saved. Check that this client is still available, then try again." };
  }
}
