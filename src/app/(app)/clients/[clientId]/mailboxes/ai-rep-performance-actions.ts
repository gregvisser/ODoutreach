"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { explainRepPerformance } from "@/server/ai/explain-rep-performance";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { requireClientEmailSequenceMutator } from "@/server/email-sequences/mutator-access";
import { requireClientAccess } from "@/server/tenant/access";

/**
 * Server action behind the "Compare our senders" button.
 *
 * Authorisation is the SAME gate as editing the client's outreach, for the same
 * reason the campaign review and the send-time advice use it: this SPENDS the
 * client's money, and a person who cannot touch the client's outreach should not
 * be able to bill them for a call on their behalf.
 *
 * The action changes nothing about any mailbox — no cap, no sending toggle, no
 * primary flag — and could not; see `explain-rep-performance.ts`.
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
      return "The AI did not return a usable comparison. Nothing was saved — please try again.";
    default:
      // The evidence gate returns a plain-English sentence naming exactly what
      // is missing ("Only one sender has sent enough to be compared…"), which is
      // more useful to an operator than anything this switch could add — on this
      // client it usually means the other mailboxes are disconnected, which is
      // the real finding. It is passed through rather than flattened.
      return reason;
  }
}

export async function explainClientRepPerformanceWithAiAction(
  formData: FormData,
): Promise<void> {
  const staff = await requireOpensDoorsStaff();
  const clientId = String(formData.get("clientId") ?? "").trim();
  if (!clientId) throw new Error("Missing clientId.");

  await requireClientAccess(staff, clientId);
  await requireClientEmailSequenceMutator(staff, clientId);

  const result = await explainRepPerformance({ clientId, staffUserId: staff.id });

  revalidatePath(`/clients/${clientId}/mailboxes`);

  const params = new URLSearchParams();
  if (result.ok) {
    params.set(
      "repPerformance",
      result.anyDistinguishable
        ? `${String(result.findings.length)} sender${result.findings.length === 1 ? "" : "s"} stood out from the rest — read the comparison below.`
        : "No sender is doing measurably better or worse than the others. That is a real answer — read why below.",
    );
  } else {
    params.set("repPerformanceError", messageForFailure(result.reason));
  }

  redirect(`/clients/${clientId}/mailboxes?${params.toString()}#ai-sender-comparison`);
}
