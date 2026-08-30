import "server-only";

/**
 * Turn a raw `runMeteredAiCall` failure reason into a sentence an operator can
 * act on, for the failures its callers don't already name.
 *
 * `runMeteredAiCall` records four refusals by a fixed code
 * (`ai_features_switched_off`, `no_api_key`, `no_rate_for_model`,
 * `no_processor_allowance`) plus, on any other failure, the raw provider
 * error message truncated to 200 chars — `anthropic_http_400: ...`, a timeout,
 * an unreadable body. Every UI action already handles the four fixed codes;
 * this covers what's left, so a misconfigured key, a rate limit and a
 * provider outage read as different sentences instead of one flattened
 * "could not be done" that means all three. Returns null for anything it
 * doesn't recognise, so a caller can fall back to its own message.
 */
export function describeUnhandledAiFailure(reason: string): string | null {
  if (/anthropic_http_40[13]\b/.test(reason) || /workspace-id/i.test(reason)) {
    return "The AI's credentials are misconfigured, so nothing ran and nothing was charged. Ask an administrator to check its setup.";
  }
  if (/anthropic_http_429\b/.test(reason)) {
    return "The AI is temporarily rate-limited. Nothing was charged — try again shortly.";
  }
  if (
    /anthropic_http_5\d\d\b/.test(reason) ||
    /anthropic_unreadable_body/.test(reason) ||
    /timeout/i.test(reason) ||
    /aborterror/i.test(reason) ||
    /fetch failed/i.test(reason)
  ) {
    return "The AI provider is temporarily unavailable. Nothing was charged — try again shortly.";
  }
  return null;
}
