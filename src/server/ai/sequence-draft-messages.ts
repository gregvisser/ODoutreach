import "server-only";

import { describeUnhandledAiFailure } from "./ai-failure-messages";

/**
 * Shown when a run is still QUEUED or RUNNING past the model timeout plus a
 * short grace, or the process stopped before it could record an outcome.
 * A timed-out call may already have been billed, so this path does not start
 * another one.
 */
export const SEQUENCE_DRAFT_INTERRUPTED_MESSAGE =
  "The sequence draft stopped before it finished. No further attempt was made. A call that already reached the provider may have been billed. Refresh this page before trying again, in case the drafts were saved.";

/** Staff sentence for a finished successful run. Same words the button used to flash. */
export function sequenceDraftSuccessMessage(result: {
  steps: readonly { absoluteDay: number }[];
  unknownPlaceholders: readonly string[];
}): string {
  const warning =
    result.unknownPlaceholders.length > 0
      ? ` One or more drafts use a placeholder we cannot fill (${result.unknownPlaceholders.join(", ")}) — fix it before approving.`
      : "";
  return `${result.steps.length} drafts written for days ${result.steps
    .map((step) => step.absoluteDay)
    .join(", ")}. Read and approve each one before it can be sent.${warning}`;
}

/** Staff sentence for a finished failed run. Raw provider text stays off the page. */
export function sequenceDraftFailureMessage(reason: string): string {
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
    case "sequence_draft_interrupted":
      return SEQUENCE_DRAFT_INTERRUPTED_MESSAGE;
    case "sequence_draft_crashed":
      return "The sequence could not be drafted. Nothing was saved.";
    default:
      return (
        describeUnhandledAiFailure(reason) ??
        "The sequence could not be drafted. Nothing was saved."
      );
  }
}
