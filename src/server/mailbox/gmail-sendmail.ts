import "server-only";

import { randomUUID } from "crypto";

import type { SendEmailResult } from "@/server/email/providers/types";

const GMAIL_SEND = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

/**
 * Generate an RFC 5322 Message-ID we control, e.g. "<uuid@sending-domain>".
 *
 * We stamp this header on the outgoing email so that when the recipient
 * replies, their In-Reply-To header carries this exact value — letting us
 * link the reply back to this specific send with certainty (rather than
 * guessing by sender address). Gmail preserves a client-supplied Message-ID.
 */
export function generateRfc822MessageId(fromEmail: string): string {
  const domain = fromEmail.split("@")[1]?.trim().toLowerCase() || "odoutreach.local";
  return `<${randomUUID()}@${domain}>`;
}

function safeHeaderLines(extraHeaders?: ReadonlyArray<{ name: string; value: string }>): string[] {
  const safeExtra: string[] = [];
  if (!extraHeaders) return safeExtra;
  for (const h of extraHeaders) {
    if (typeof h?.name !== "string" || typeof h?.value !== "string") continue;
    const name = h.name.trim();
    const value = h.value.trim();
    if (!name || !value) continue;
    if (/[\r\n:]/.test(name)) continue;
    if (/[\r\n]/.test(value)) continue;
    safeExtra.push(`${name}: ${value}`);
  }
  return safeExtra;
}

/**
 * Build a minimal RFC 5322 message. When HTML is supplied, send multipart/alternative:
 * text/plain keeps the raw unsubscribe URL fallback, while text/html can render a
 * clean "Unsubscribe" anchor.
 */
export function buildRfc5322PlainTextEmail(input: {
  from: string;
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  extraHeaders?: ReadonlyArray<{ name: string; value: string }>;
}): string {
  const { from, to, subject, bodyText, bodyHtml, extraHeaders } = input;
  const safeExtra = safeHeaderLines(extraHeaders);
  const html = bodyHtml?.trim();
  if (html) {
    const boundary = "odoutreach_alt_9f3f5d0d4e7a";
    return [
      ...safeExtra,
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      bodyText,
      `--${boundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      html,
      `--${boundary}--`,
      "",
    ].join("\r\n");
  }
  const lines = [
    ...safeExtra,
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    bodyText,
  ];
  return lines.join("\r\n");
}

export function rfc5322ToGmailRawBase64Url(rfc5322: string): string {
  return Buffer.from(rfc5322, "utf8").toString("base64url");
}

/**
 * POST users.messages.send — as the connected Gmail user. `from` must match the mailbox address.
 */
export async function sendGmailUsersMessagesSend(input: {
  accessToken: string;
  rfc5322Message: string;
}): Promise<SendEmailResult> {
  const raw = rfc5322ToGmailRawBase64Url(input.rfc5322Message);
  const res = await fetch(GMAIL_SEND, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
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
  if (res.status >= 500) {
    return { ok: false, error: `Gmail API server error: ${text}`, code: String(res.status) };
  }

  let json: { id?: string } = {};
  try {
    json = JSON.parse(text) as { id?: string };
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
    error: `Gmail send failed (${res.status}): ${text}`,
    code: String(res.status),
  };
}
