"use server";

import { redirect } from "next/navigation";

import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { campaignReviewFailureMessage } from "@/server/ai/campaign-review-messages";
import {
  preflightCampaignReview,
  scheduleCampaignReview,
} from "@/server/ai/review-campaign";
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
 * It does not wait for the model. A full sequence review on grok outlives the
 * browser POST (the same cut that detached sequence drafting). The call runs
 * afterwards and the panel polls.
 */

function redirectWith(clientId: string, params: URLSearchParams): never {
  redirect(`/clients/${clientId}/outreach?${params.toString()}#ai-campaign-review`);
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

  const preflight = await preflightCampaignReview({ clientId, sequenceId });
  if (!preflight.ok) {
    const params = new URLSearchParams();
    params.set("campaignReviewError", campaignReviewFailureMessage(preflight.reason));
    redirectWith(clientId, params);
  }

  const since = Date.now();
  scheduleCampaignReview({
    clientId,
    sequenceId,
    staffUserId: staff.id,
  });

  const params = new URLSearchParams();
  params.set("campaignReviewPending", sequenceId);
  params.set("campaignReviewSince", String(since));
  redirectWith(clientId, params);
}
