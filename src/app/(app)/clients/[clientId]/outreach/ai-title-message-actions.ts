"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { describeUnhandledAiFailure } from "@/server/ai/ai-failure-messages";
import { adviseTitleMessages } from "@/server/ai/advise-title-messages";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { requireClientEmailSequenceMutator } from "@/server/email-sequences/mutator-access";
import { requireClientAccess } from "@/server/tenant/access";

/**
 * Server action behind the "Which campaign suits which job title" button.
 *
 * Authorisation is the SAME gate as editing the client's outreach, for the
 * reason the other AI features use it: this SPENDS the client's money, and a
 * person who cannot touch the client's outreach should not be able to bill them
 * for a call on their behalf.
 *
 * The action changes nothing about any campaign, template, contact list or
 * enrolment, and could not; see `advise-title-messages.ts`.
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
      return "The AI did not return a usable analysis. Nothing was saved — please try again.";
    default:
      // The evidence gate returns a plain-English sentence naming exactly what
      // is missing — a second campaign at the same audience, job titles on the
      // imported contacts, or simply more replies. That is more useful to an
      // operator than anything this switch could add, so it is passed through
      // rather than flattened. But a raw provider error code (a 400/401/429/5xx,
      // a timeout) is not a gate sentence and must not reach the screen verbatim.
      return describeUnhandledAiFailure(reason) ?? reason;
  }
}

export async function adviseClientTitleMessagesWithAiAction(
  formData: FormData,
): Promise<void> {
  const staff = await requireOpensDoorsStaff();
  const clientId = String(formData.get("clientId") ?? "").trim();
  if (!clientId) throw new Error("Missing clientId.");

  await requireClientAccess(staff, clientId);
  await requireClientEmailSequenceMutator(staff, clientId);

  const result = await adviseTitleMessages({ clientId, staffUserId: staff.id });

  revalidatePath(`/clients/${clientId}/outreach`);

  const params = new URLSearchParams();
  if (result.ok) {
    params.set(
      "titleMessage",
      result.anyDistinguishable
        ? `${String(result.findings.length)} campaign/audience pair${result.findings.length === 1 ? "" : "s"} stood out — read the analysis below.`
        : "No campaign is doing measurably better than another with any audience. That is a real answer — read why below.",
    );
  } else {
    params.set("titleMessageError", messageForFailure(result.reason));
  }

  redirect(`/clients/${clientId}/outreach?${params.toString()}#ai-message-fit`);
}
