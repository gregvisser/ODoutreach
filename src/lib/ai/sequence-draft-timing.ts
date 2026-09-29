/**
 * Clocks for one "Write a sequence with AI" run.
 *
 * These live here, not in the server module, so the model abort, the run
 * deadline, and the browser poll cannot drift apart. Reply classification
 * does not use them.
 *
 * grok-4.7 and grok-4.6 default to `reasoning_effort: "high"` and cannot
 * disable reasoning (docs.x.ai). A five-email forced tool call stays silent
 * until the final body. Production aborted at 90s and the staff banner was
 * the timeout sentence ("The AI provider is temporarily unavailable"), which
 * is what `describeUnhandledAiFailure` returns for that abort. xAI's own
 * clients wait many minutes; Azure App Service drops an idle outbound socket
 * at about four minutes, so a longer silent wait would fail the same way.
 * Sequence drafting therefore asks those models for `low` effort (the setting
 * xAI documents for simple tool calls) and allows three minutes of wall clock,
 * under that four-minute idle limit.
 *
 * Campaign review and the other staff-triggered advice calls (send time,
 * job-title fit, sender comparison) send a similar forced tool call. They
 * used to keep the 20s classification abort, so grok's default high effort
 * was reported as "The AI provider is temporarily unavailable". They share
 * this budget through {@link onDemandToolCallBudget}. Reply classification
 * and the short training assistant do not.
 */

/** Model HTTP abort for sequence drafting and the other staff-triggered tool calls. */
export const AI_SEQUENCE_DRAFTING_CALL_TIMEOUT_MS = 180_000;

/**
 * After the model abort, time for the draft rows to commit and the run to be
 * marked finished. This is not extra model time.
 */
export const SEQUENCE_DRAFT_RUN_GRACE_MS = 30_000;

export function sequenceDraftRunDeadlineMs(): number {
  return AI_SEQUENCE_DRAFTING_CALL_TIMEOUT_MS + SEQUENCE_DRAFT_RUN_GRACE_MS;
}

/**
 * Stop the templates page polling after this long. It sits one grace past the
 * server deadline so a row marked at the deadline is still shown, and a draft
 * that finishes inside the model timeout is not hidden by the page giving up.
 */
export const SEQUENCE_DRAFT_POLL_GIVE_UP_MS =
  sequenceDraftRunDeadlineMs() + SEQUENCE_DRAFT_RUN_GRACE_MS;

export const XAI_REASONING_EFFORTS = ["low", "medium", "high", "xhigh"] as const;

export type XaiReasoningEffort = (typeof XAI_REASONING_EFFORTS)[number];

/**
 * Effort for a sequence draft. `low` is xAI's latency setting for tool calls.
 * Omitted for models that do not take the parameter, so a non-reasoning model
 * is not rejected with a 400.
 */
export const SEQUENCE_DRAFT_REASONING_EFFORT: XaiReasoningEffort = "low";

const SEQUENCE_DRAFT_REASONING_MODELS: ReadonlySet<string> = new Set([
  "grok-4.5",
  "grok-4.6",
  "grok-4.7",
]);

export function sequenceDraftReasoningEffort(model: string): XaiReasoningEffort | undefined {
  if (!SEQUENCE_DRAFT_REASONING_MODELS.has(model)) return undefined;
  return SEQUENCE_DRAFT_REASONING_EFFORT;
}

/**
 * Wall clock and reasoning effort for a staff-triggered forced tool call.
 *
 * Same numbers as sequence drafting (#706). `reasoningEffort` is omitted for
 * models that reject the field, so a non-reasoning model is not a 400.
 */
export function onDemandToolCallBudget(model: string): {
  timeoutMs: number;
  reasoningEffort: XaiReasoningEffort | undefined;
} {
  return {
    timeoutMs: AI_SEQUENCE_DRAFTING_CALL_TIMEOUT_MS,
    reasoningEffort: sequenceDraftReasoningEffort(model),
  };
}
