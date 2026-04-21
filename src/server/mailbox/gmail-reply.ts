import "server-only";

import type { SendEmailResult } from "@/server/email/providers/types";

const GMAIL_SEND = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

/**
 * Build an RFC 5322 plain-text reply message. Always includes threading
 * headers when the caller knows the original `Message-Id` — if it is not
 * available we fall back to `threadId` on the API body alone (Gmail still
 * groups the reply into the same thread using `threadId`).
 *
 * Exported for unit tests so we can assert header shape without a live API.
 */
export function buildReplyRfc5322PlainTextEmail(input: {
  from: string;
  to: string;
  subject: string;
  bodyText: string;
  inReplyToMessageId?: string | null;
  referencesMessageIds?: readonly string[];
}): string {
  const { from, to, subject, bodyText } = input;
  const lines: string[] = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
  ];
  const inReplyTo = input.inReplyToMessageId?.trim();
  if (inReplyTo) {
    lines.push(`In-Reply-To: ${ensureAngleBrackets(inReplyTo)}`);
  }
  const references = (input.referencesMessageIds ?? [])
    .map((r) => r?.trim())
    .filter((r): r is string => !!r)
    .map(ensureAngleBrackets);
  if (references.length > 0) {
    lines.push(`References: ${references.join(" ")}`);
  } else if (inReplyTo) {
    lines.push(`References: ${ensureAngleBrackets(inReplyTo)}`);
  }
  lines.push("", bodyText);
  return lines.join("\r\n");
}

function ensureAngleBrackets(id: string): string {
  const trimmed = id.trim();
  if (trimmed.startsWith("<") && trimmed.endsWith(">")) return trimmed;
  return `<${trimmed}>`;
}

export function rfc5322ToGmailRawBase64Url(rfc5322: string): string {
  return Buffer.from(rfc5322, "utf8").toString("base64url");
}

/**
 * POST users.messages.send with an optional `threadId` so Gmail nests
 * the reply in the same conversation. Subject / headers must match the
 * thread (we pass them via the RFC 5322 message body).
 */
export async function sendGmailReply(input: {
  accessToken: string;
  rfc5322Message: string;
  threadId?: string | null;
}): Promise<SendEmailResult> {
  const raw = rfc5322ToGmailRawBase64Url(input.rfc5322Message);
  const body: Record<string, string> = { raw };
  const threadId = input.threadId?.trim();
  if (threadId) body.threadId = threadId;

  const res = await fetch(GMAIL_SEND, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = (await res.text()).slice(0, 2000);
  if (res.status === 429) {
    return { ok: false, error: `Gmail API throttled: ${text}`, code: "429" };
  }
  if (res.status === 401) {
    return { ok: false, error: `Gmail API auth failed: ${text}`, code: "401" };
  }
  if (res.status === 403) {
    return {
      ok: false,
      error: `Gmail API forbidden (check gmail.send scope): ${text}`,
      code: "403",
    };
  }
  if (res.status === 404) {
    return {
      ok: false,
      error: `Gmail thread not found in this mailbox (${text}).`,
      code: "404",
    };
  }
  if (res.status >= 500) {
    return { ok: false, error: `Gmail API server error: ${text}`, code: String(res.status) };
  }

  let json: { id?: string; threadId?: string } = {};
  try {
    json = JSON.parse(text) as { id?: string; threadId?: string };
  } catch {
    /* ignore */
  }

  if (res.ok && typeof json.id === "string" && json.id.length > 0) {
    return {
      ok: true,
      providerMessageId: `gmail:${json.id}`,
      providerName: "google_gmail",
    };
  }

  return {
    ok: false,
    error: `Gmail reply failed (${res.status}): ${text}`,
    code: String(res.status),
  };
}
