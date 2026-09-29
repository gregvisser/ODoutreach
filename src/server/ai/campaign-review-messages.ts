import "server-only";

import { describeUnhandledAiFailure } from "./ai-failure-messages";

/**
 * Staff sentences for a campaign review. Shared by the button's redirect and
 * the status poll so a detached run says the same thing as a finished one.
 */
export function campaignReviewFailureMessage(reason: string): string {
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

export function campaignReviewSuccessMessage(score: number, findingCount: number): string {
  const tail =
    findingCount === 0
      ? "The AI found nothing worth changing."
      : `${String(findingCount)} thing${findingCount === 1 ? "" : "s"} worth looking at — read them below.`;
  return `Scored ${String(score)} out of 100. ${tail} This is advice about the writing only; it does not change whether the campaign can be launched.`;
}
