/**
 * PR J — pure validation for the reply composer. Runs on the client
 * (disable send) and the server (reject with errorCode). Keeping it pure
 * lets us unit-test the exact operator-facing rules without Prisma.
 *
 * The server still re-checks everything in `replyToInboundMailboxMessage`
 * — this helper exists so the UI can show "too long" / "empty" feedback
 * before the operator clicks send.
 */

export const INBOUND_REPLY_BODY_MAX = 50_000;
export const INBOUND_REPLY_SUBJECT_MAX = 300;

export type ReplyDraftValidation =
  | { ok: true; trimmedBody: string }
  | {
      ok: false;
      reason: "BODY_REQUIRED" | "BODY_TOO_LONG" | "SUBJECT_MISSING";
      message: string;
    };

export function validateReplyDraft(input: {
  bodyText: string;
  subject: string;
}): ReplyDraftValidation {
  const subject = input.subject.trim();
  if (!subject) {
    return {
      ok: false,
      reason: "SUBJECT_MISSING",
      message: "Reply subject is empty — refresh the page and try again.",
    };
  }
  const trimmed = input.bodyText.trim();
  if (!trimmed) {
    return {
      ok: false,
      reason: "BODY_REQUIRED",
      message: "Write a reply before sending.",
    };
  }
  if (trimmed.length > INBOUND_REPLY_BODY_MAX) {
    return {
      ok: false,
      reason: "BODY_TOO_LONG",
      message: `Reply body is too long (max ${String(INBOUND_REPLY_BODY_MAX)} characters).`,
    };
  }
  return { ok: true, trimmedBody: trimmed };
}
