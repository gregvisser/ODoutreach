/**
 * Which AI-campaign tick errors are a busy or slow provider, and which are
 * a real fault. A busy provider waits for the next pass. A real fault counts
 * toward asking a person.
 */

const PROVIDER_HTTP = /\b(?:xai|anthropic)_http_(\d{3})\b/i;
const GENERIC_HTTP = /\bHTTP\s+(\d{3})\b/;

const TRANSIENT_WITHOUT_STATUS: readonly RegExp[] = [
  /\b(?:xai|anthropic)_timeout\b/i,
  /(?:^|_)timeout\b/i,
  /\bexceeded\s+\d+\s*ms\b/i,
  /\bTimeoutError\b/,
  /aborted due to timeout/i,
  /resource[\s_-]*exhausted/i,
  /\bat capacity\b/i,
  /\bhigh demand\b/i,
  /\boverloaded\b/i,
  /\brate[- ]limited\b/i,
  /\b(?:xai|anthropic)_unreadable_body\b/i,
  /\b(?:xai|anthropic)_network\b/i,
  /\b(?:xai|anthropic)_aborted\b/i,
  /\bfetch failed\b/i,
  /\b(?:ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|ECONNREFUSED|UND_ERR_CONNECT_TIMEOUT)\b/,
  /\bsocket hang up\b/i,
];

function httpStatus(message: string): number | null {
  const named = message.match(PROVIDER_HTTP);
  if (named?.[1]) return Number(named[1]);
  const generic = message.match(GENERIC_HTTP);
  if (generic?.[1]) return Number(generic[1]);
  return null;
}

function statusIsTransient(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/**
 * True for a timeout, a capacity or rate limit, or a provider that is down.
 * A rejected request (other 4xx), a bad key, or a bad brief stays false even
 * when the body mentions a timeout.
 */
export function isTransientAiCampaignFailure(message: string): boolean {
  const status = httpStatus(message);
  if (status !== null) {
    if (status >= 400 && status < 500 && !statusIsTransient(status)) return false;
    if (statusIsTransient(status)) return true;
  }
  return TRANSIENT_WITHOUT_STATUS.some((pattern) => pattern.test(message));
}

/** Sentence for the campaign timeline. It does not ask a person to click. */
export function aiCampaignTransientHoldMessage(message: string): string {
  const again = "The machine will try this step again shortly.";
  if (
    /\b(?:xai|anthropic)_http_429\b/i.test(message) ||
    /\bHTTP\s+429\b/.test(message) ||
    /resource[\s_-]*exhausted/i.test(message) ||
    /\bat capacity\b/i.test(message) ||
    /\bhigh demand\b/i.test(message) ||
    /\brate[- ]limited\b/i.test(message)
  ) {
    return `The AI service is at capacity. ${again}`;
  }
  if (
    /timeout/i.test(message) ||
    /\bexceeded\s+\d+\s*ms\b/i.test(message) ||
    /\bTimeoutError\b/.test(message)
  ) {
    return `The AI service took too long to answer. ${again}`;
  }
  return `The AI service is unavailable right now. ${again}`;
}
