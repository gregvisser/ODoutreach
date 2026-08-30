"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { describeUnhandledAiFailure } from "@/server/ai/ai-failure-messages";
import { reviewCampaign } from "@/server/ai/review-campaign";
import { requireClientEmailSequenceMutator } from "@/server/email-sequences/mutator-access";
import { requireClientAccess } from "@/server/tenant/access";

/**
 * Server action behind the "Review this campaign with AI" button.
 *
 * Authorisation is the SAME gate as editing the sequence
 * (`requireClientEmailSequenceMutator`), not a weaker one. Two reasons, and the
 * second is the one that decided it: the review reads every email in the
 * campaign, so it is a read of the same copy; and it SPENDS the client's money,
 * which is not something a person who cannot touch the campaign should be able
 * to do on their behalf.
 *
 * The action changes nothing about the campaign — see `review-campaign.ts`.
 */

function messageForFailure(reason: string): string {
  switch (reason) {
    case "ai_features_switched_off":
      return "AI features are switched off. Nothing was reviewed and nothing was charged.";
    case "no_api_key":
      return "The AI is not configured yet, so nothing was reviewed. Ask an administrator to add the key.";
    case "no_rate_for_model":
      return "No price is recorded for that model, so the call was refused rather than run unbilled.";
    case "sequence_not_found":
      return "That campaign could not be found.";
    case "no_steps":
      return "This campaign has no emails in it yet, so there is nothing to review. Nothing was charged.";
    case "unusable_answer":
      return "The AI did not return a usable review. Nothing was saved — please try again.";
    default:
      return (
        describeUnhandledAiFailure(reason) ??
        "The campaign could not be reviewed. Nothing was saved."
      );
  }
}

export async function reviewClientCampaignWithAiAction(
  formData: FormData,
): Promise<void> {
  const staff = await requireOpensDoorsStaff();
  const clientId = String(formData.get("clientId") ?? "").trim();
  const sequenceId = String(formData.get("sequenceId") ?? "").trim();
  if (!clientId) throw new Error("Missing clientId.");
  if (!sequenceId) throw new Error("Missing sequenceId.");

  await requireClientAccess(staff, clientId);
  await requireClientEmailSequenceMutator(staff, clientId);

  const result = await reviewCampaign({
    clientId,
    sequenceId,
    staffUserId: staff.id,
  });

  revalidatePath(`/clients/${clientId}/outreach`);

  const params = new URLSearchParams();
  if (result.ok) {
    const count = result.findings.length;
    const tail =
      count === 0
        ? "The AI found nothing worth changing."
        : `${String(count)} thing${count === 1 ? "" : "s"} worth looking at — read them below.`;
    params.set(
      "campaignReview",
      `Scored ${String(result.score)} out of 100. ${tail} This is advice about the writing only; it does not change whether the campaign can be launched.`,
    );
  } else {
    params.set("campaignReviewError", messageForFailure(result.reason));
  }

  redirect(
    `/clients/${clientId}/outreach?${params.toString()}#ai-campaign-review`,
  );
}
