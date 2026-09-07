import { INBOUND_REPLY_BODY_MAX } from "./inbound-reply-validation";

export type ReplyAttempt = { requestId: string; bodyText: string };

export function isReplyRequestId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function replyAttemptStorageKey(staffUserId: string, clientId: string, messageId: string): string {
  return `odoutreach:reply-attempt:${JSON.stringify([staffUserId, clientId, messageId])}`;
}

/** Invalid saved state must not silently become a fresh send. */
export function parseReplyAttempt(raw: string | null): ReplyAttempt | null {
  if (raw === null) return null;
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || !("requestId" in value) || !("bodyText" in value)
    || !isReplyRequestId(value.requestId) || typeof value.bodyText !== "string"
    || !value.bodyText.trim() || value.bodyText.length > INBOUND_REPLY_BODY_MAX) {
    throw new Error("The saved reply attempt could not be read. Check the mailbox's Sent folder before sending again.");
  }
  return { requestId: value.requestId.toLowerCase(), bodyText: value.bodyText.trim() };
}

type AttemptStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function rememberReplyAttempt(storage: AttemptStorage, key: string, attempt: ReplyAttempt): void {
  const existing = parseReplyAttempt(storage.getItem(key));
  if (existing && (existing.requestId !== attempt.requestId || existing.bodyText !== attempt.bodyText)) {
    throw new Error("A previous reply attempt needs checking before a new reply can be sent.");
  }
  storage.setItem(key, JSON.stringify(attempt));
}

export function forgetReplyAttempt(storage: AttemptStorage, key: string, requestId: string): void {
  const existing = parseReplyAttempt(storage.getItem(key));
  if (existing && existing.requestId !== requestId) throw new Error("A different reply attempt is still saved.");
  storage.removeItem(key);
}
