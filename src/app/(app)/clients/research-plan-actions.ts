"use server";
import { revalidatePath } from "next/cache";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { INVALID_ROCKETREACH_INDUSTRIES, saveResearchPlan } from "@/server/prospect-research/plans";
import { researchPlanSchema } from "@/lib/prospect-research/qualification";
export async function saveResearchPlanAction(clientId: string, input: unknown) {
  const staff = await requireOpensDoorsStaff();
  const parsed = researchPlanSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Complete the plan name, job titles, industries, regions, and a whole-number lookup limit from 1 to 100. Seniority is optional." };
  try {
    await saveResearchPlan(staff, clientId, parsed.data);
    revalidatePath(`/clients/${clientId}/sources`);
    return { ok: true };
  } catch (err) {
    if (err instanceof Error && err.message.startsWith(`${INVALID_ROCKETREACH_INDUSTRIES}:`)) {
      const names = err.message.slice(INVALID_ROCKETREACH_INDUSTRIES.length + 1);
      return {
        ok: false,
        error: `These industries are not in the RocketReach list: ${names}. Choose the industry names from the list.`,
      };
    }
    return { ok: false, error: "The research plan could not be saved. Check that this client is still available, then try again." };
  }
}
