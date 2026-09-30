/**
 * Which AI-campaign step failures may ask for a person.
 *
 * The tick used to count every thrown error toward
 * {@link AI_CAMPAIGN_FAILURE_LIMIT}. Production campaign
 * `cmuny1jtj006qfynsdiga5lpq` (30 Sep 2026) reached Writing, then moved to
 * Waiting for a member of staff after `xai_http_429` / `resource-exhausted`
 * and `xai_timeout: exceeded 180000ms`. Those are provider capacity, not a
 * draft that will never succeed.
 *
 * The 180s figure is the existing model abort
 * (`AI_SEQUENCE_DRAFTING_CALL_TIMEOUT_MS`). Writing and the writing check are
 * separate ticks, and that abort sits under Azure App Service's idle-socket
 * limit. This module retries the timeout. It does not lengthen the call.
 */

/** Lead sentence on the campaign timeline when xAI should be tried again. */
export const AI_CAMPAIGN_XAI_BUSY_RETRY = "xAI busy, will retry.";

const HARD_XAI_CLIENT_ERROR = /\bxai_http_(4\d\d)\b/;
const TRANSIENT_XAI_TIMEOUT = /\bxai_timeout\b/i;
const TRANSIENT_XAI_429 = /\bxai_http_429\b/;
const TRANSIENT_XAI_408 = /\bxai_http_408\b/;
const TRANSIENT_XAI_5XX = /\bxai_http_5\d\d\b/;
const TRANSIENT_XAI_TRANSPORT = /\bxai_(?:network|aborted|unreadable_body)\b/;
const RESOURCE_EXHAUSTED = /resource[-_ ]exhausted/i;
const MODEL_AT_CAPACITY = /\bmodel at capacity\b/i;

function isHardXaiClientError(message: string): boolean {
  const match = HARD_XAI_CLIENT_ERROR.exec(message);
  if (!match?.[1]) return false;
  return match[1] !== "408" && match[1] !== "429";
}

/**
 * True only for an xAI capacity, rate-limit, timeout, or transport failure.
 * Mailbox capacity, a rejected request, and an unusable draft stay false.
 */
export function isTransientAiCampaignProviderFailure(message: string): boolean {
  if (isHardXaiClientError(message)) return false;
  if (TRANSIENT_XAI_TIMEOUT.test(message)) return true;
  if (TRANSIENT_XAI_429.test(message)) return true;
  if (TRANSIENT_XAI_408.test(message)) return true;
  if (TRANSIENT_XAI_5XX.test(message)) return true;
  if (TRANSIENT_XAI_TRANSPORT.test(message)) return true;
  if (RESOURCE_EXHAUSTED.test(message)) return true;
  if (MODEL_AT_CAPACITY.test(message)) return true;
  if (/\bxai_/i.test(message) && /\bat capacity\b/i.test(message)) return true;
  return false;
}

/** Timeline sentence for a failure that will be tried on a later tick. */
export function aiCampaignTransientRetryMessage(message: string): string {
  if (TRANSIENT_XAI_TIMEOUT.test(message)) {
    return `${AI_CAMPAIGN_XAI_BUSY_RETRY} The model did not answer in time, so this step waits for the next check. Nothing was sent.`;
  }
  if (
    TRANSIENT_XAI_429.test(message) ||
    RESOURCE_EXHAUSTED.test(message) ||
    MODEL_AT_CAPACITY.test(message) ||
    (/\bxai_/i.test(message) && /\bat capacity\b/i.test(message))
  ) {
    return `${AI_CAMPAIGN_XAI_BUSY_RETRY} The model is at capacity, so this step waits for the next check. Nothing was sent.`;
  }
  return `${AI_CAMPAIGN_XAI_BUSY_RETRY} The provider did not respond, so this step waits for the next check. Nothing was sent.`;
}

/** Timeline sentence for a failure that counts toward asking for a person. */
export function aiCampaignHardFailureMessage(message: string, escalated: boolean): string {
  const detail = message.trim() || "This step failed.";
  if (!escalated) return detail;
  return `Waiting for a member of staff. ${detail} Nothing further will be tried until someone steps in.`;
}
