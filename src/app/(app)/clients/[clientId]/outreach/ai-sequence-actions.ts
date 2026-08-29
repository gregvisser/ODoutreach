"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { draftSequenceForClient } from "@/server/ai/draft-sequence";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { requireClientEmailTemplateMutator } from "@/server/email-templates/mutator-access";
import { requireClientAccess } from "@/server/tenant/access";

/**
 * Server action behind the "Write a sequence with AI" button.
 *
 * Authorisation is deliberately the SAME gate as writing a template by hand
 * (`requireClientEmailTemplateMutator`), not a weaker one. What this produces is
 * a set of draft templates for one client, so anybody allowed to type those
 * drafts is allowed to ask for them; and nobody who is not, is not.
 *
 * The action itself sends nothing and approves nothing — see
 * `draft-sequence.ts` for why that separation is load-bearing.
 */

function messageForFailure(reason: string): string {
  switch (reason) {
    case "ai_features_switched_off":
      return "AI features are switched off. Nothing was drafted and nothing was charged.";
    case "no_api_key":
      return "The AI is not configured yet, so nothing was drafted. Ask an administrator to add the key.";
    case "no_rate_for_model":
      return "No price is recorded for that model, so the call was refused rather than run unbilled.";
    case "client_not_found":
      return "That client workspace could not be found.";
    case "unusable_answer":
      return "The AI did not return a usable sequence. Nothing was saved — please try again.";
    default:
      return "The sequence could not be drafted. Nothing was saved.";
  }
}

export async function draftClientSequenceWithAiAction(
  formData: FormData,
): Promise<void> {
  const staff = await requireOpensDoorsStaff();
  const clientId = String(formData.get("clientId") ?? "").trim();
  if (!clientId) throw new Error("Missing clientId.");

  await requireClientAccess(staff, clientId);
  await requireClientEmailTemplateMutator(staff, clientId);

  const result = await draftSequenceForClient({
    clientId,
    staffUserId: staff.id,
  });

  revalidatePath(`/clients/${clientId}/templates`);
  revalidatePath(`/clients/${clientId}/outreach`);

  const params = new URLSearchParams();
  if (result.ok) {
    const warning =
      result.unknownPlaceholders.length > 0
        ? ` One or more drafts use a placeholder we cannot fill (${result.unknownPlaceholders.join(", ")}) — fix it before approving.`
        : "";
    params.set(
      "template",
      `${result.steps.length} drafts written for days ${result.steps
        .map((s) => s.absoluteDay)
        .join(", ")}. Read and approve each one before it can be sent.${warning}`,
    );
  } else {
    params.set("templateError", messageForFailure(result.reason));
  }

  redirect(
    `/clients/${clientId}/templates?${params.toString()}#client-email-templates`,
  );
}
