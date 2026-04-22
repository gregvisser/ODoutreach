import "server-only";

import type { SendEmailResult } from "@/server/email/providers/types";

const GMAIL_SEND = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

/**
 * Build a minimal RFC 5322 plain-text message (UTF-8 body). For governed test / operator sends.
 *
 * Optional `extraHeaders` are injected before the standard headers so
 * compliance headers (e.g. `List-Unsubscribe`,
 * `List-Unsubscribe-Post`) travel with the provider send. Each entry
 * must be `{ name, value }` — names and values are validated for CR
 * or LF injection and silently dropped if unsafe. The caller is
 * responsible for supplying canonical values (see
 * `buildListUnsubscribeHeaders`).
 */
export function buildRfc5322PlainTextEmail(input: {
  from: string;
  to: string;
  subject: string;
  bodyText: string;
  extraHeaders?: ReadonlyArray<{ name: string; value: string }>;
}): string {
  const { from, to, subject, bodyText, extraHeaders } = input;
  const safeExtra: string[] = [];
  if (extraHeaders) {
    for (const h of extraHeaders) {
      if (typeof h?.name !== "string" || typeof h?.value !== "string") continue;
      const name = h.name.trim();
      const value = h.value.trim();
      if (!name || !value) continue;
      if (/[\r\n:]/.test(name)) continue;
      if (/[\r\n]/.test(value)) continue;
      safeExtra.push(`${name}: ${value}`);
    }
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
