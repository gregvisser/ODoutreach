import { SEQUENCE_DRAFT_POLL_GIVE_UP_MS } from "./sequence-draft-timing";

/** How often the templates page asks whether a detached draft run has finished. */
export const SEQUENCE_DRAFT_POLL_INTERVAL_MS = 2_000;

/**
 * Stop asking after this long even if the server still says the run is open.
 * Defined with the model timeout so a longer draft is still on screen when it
 * finishes. The server will not start a second model call. This only stops
 * the browser from polling forever.
 */
export { SEQUENCE_DRAFT_POLL_GIVE_UP_MS };

/** Transient status-request failures tolerated before the page stops polling. */
export const SEQUENCE_DRAFT_POLL_MAX_FAILURES = 5;

export type SequenceDraftPollStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";

export type SequenceDraftPollStep =
  | { action: "wait"; delayMs: number; consecutiveFailures: number }
  | { action: "done"; status: "SUCCEEDED" | "FAILED" }
  | { action: "give-up" };

/**
 * Decide the next poll step from one status response.
 * A terminal run wins over the give-up clock, so a late success is still shown.
 * Give-up does not start another draft.
 */
export function nextSequenceDraftPoll(args: {
  elapsedMs: number;
  consecutiveFailures: number;
  response: { ok: true; status: SequenceDraftPollStatus } | { ok: false };
}): SequenceDraftPollStep {
  if (
    args.response.ok &&
    (args.response.status === "SUCCEEDED" || args.response.status === "FAILED")
  ) {
    return { action: "done", status: args.response.status };
  }
  if (args.elapsedMs > SEQUENCE_DRAFT_POLL_GIVE_UP_MS) {
    return { action: "give-up" };
  }
  if (!args.response.ok) {
    const consecutiveFailures = args.consecutiveFailures + 1;
    if (consecutiveFailures >= SEQUENCE_DRAFT_POLL_MAX_FAILURES) {
      return { action: "give-up" };
    }
    return {
      action: "wait",
      delayMs: SEQUENCE_DRAFT_POLL_INTERVAL_MS,
      consecutiveFailures,
    };
  }
  return {
    action: "wait",
    delayMs: SEQUENCE_DRAFT_POLL_INTERVAL_MS,
    consecutiveFailures: 0,
  };
}
