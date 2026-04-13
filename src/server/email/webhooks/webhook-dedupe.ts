import "server-only";

import { createHash } from "node:crypto";

/**
 * Stable dedupe key for provider webhook deliveries (replay-safe insert).
 * Prefer Svix message id when present — identical replays share the same id.
 */
export function computeWebhookDedupeHash(input: {
  providerName: string;
  webhookMessageId?: string | null;
  eventType: string;
  providerMessageId: string;
}): string {
  if (input.webhookMessageId?.trim()) {
    return createHash("sha256")
      .update(`svix|${input.providerName}|${input.webhookMessageId.trim()}`)
      .digest("hex");
  }
  return createHash("sha256")
    .update(
      `fb|${input.providerName}|${input.eventType}|${input.providerMessageId}`,
    )
    .digest("hex");
}
