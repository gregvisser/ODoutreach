"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { describeUnhandledAiFailure } from "@/server/ai/ai-failure-messages";
import { adviseSendTimes } from "@/server/ai/advise-send-times";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { requireClientEmailSequenceMutator } from "@/server/email-sequences/mutator-access";
import { requireClientAccess } from "@/server/tenant/access";

/**
 * Server action behind the "Work out our best send times" button.
 *
 * Authorisation is the SAME gate as editing the sequence, for the same reason
 * the campaign review uses it: this SPENDS the client's money, and a person who
 * cannot touch the client's outreach should not be able to bill them for a call
 * on their behalf.
 *
 * The action changes nothing about when anything is sent, and could not — see
 * `advise-send-times.ts`.
 */

function messageForFailure(reason: string): string {
  switch (reason) {
    case "ai_features_switched_off":
      return "AI features are switched off. Nothing was analysed and nothing was charged.";
    case "no_api_key":
      return "The AI is not configured yet, so nothing was analysed. Ask an administrator to add the key.";
    case "no_rate_for_model":
      return "No price is recorded for that model, so the call was refused rather than run unbilled.";
    case "client_not_found":
      return "That workspace could not be found.";
    case "unusable_answer":
      return "The AI did not return usable advice. Nothing was saved — please try again.";
    default:
      // The evidence gate returns a plain-English sentence naming exactly what
      // is missing ("Not enough replies yet — 6 of the 20 needed…"), which is
      // more useful to an operator than anything this switch could add. It is
      // passed through rather than flattened into "not enough data". But a raw
      // provider error code (a 400/401/429/5xx, a timeout) is not a gate
      // sentence and must not reach the screen verbatim.
      return describeUnhandledAiFailure(reason) ?? reason;
  }
}

export async function adviseClientSendTimesWithAiAction(
  formData: FormData,
): Promise<void> {
  const staff = await requireOpensDoorsStaff();
  const clientId = String(formData.get("clientId") ?? "").trim();
  if (!clientId) throw new Error("Missing clientId.");

  await requireClientAccess(staff, clientId);
  await requireClientEmailSequenceMutator(staff, clientId);

  const result = await adviseSendTimes({ clientId, staffUserId: staff.id });

  revalidatePath(`/clients/${clientId}/outreach`);

  const params = new URLSearchParams();
  if (result.ok) {
    const count = result.windows.length;
    params.set(
      "sendTimeAdvice",
      count === 0
        ? "The AI found no time of day that makes a material difference for this client. That is a real answer — read why below."
        : `${String(count)} suggested time${count === 1 ? "" : "s"} to send — read them below. Nothing has been rescheduled: this is advice for a person to act on.`,
    );
  } else {
    params.set("sendTimeAdviceError", messageForFailure(result.reason));
  }

  redirect(`/clients/${clientId}/outreach?${params.toString()}#ai-send-times`);
}
