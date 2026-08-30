import "server-only";

import { randomUUID } from "crypto";

import type {
  MailboxMessageLookupResult,
  SendEmailResult,
} from "@/server/email/providers/types";

const GMAIL_SEND = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const GMAIL_LIST = "https://gmail.googleapis.com/gmail/v1/users/me/messages";

/**
 * Generate an RFC 5322 Message-ID we control, e.g. "<uuid@sending-domain>".
 *
 * We stamp this header on the outgoing email hoping that when the recipient
 * replies, their In-Reply-To header will carry this exact value — letting us
 * link the reply back to this specific send with certainty (rather than
 * guessing by sender address). Measured against production 2026-08-30
 * (row 105, docs/ops/REPLY-MATCHER-LEG1-MEASUREMENT-2026-08-30.md): it
 * doesn't happen. Gmail's `users.messages.send` REWRITES the Message-ID we
 * supply to its own `<...@mail.gmail.com>` value before delivery — every
 * sampled reply's In-Reply-To carried Gmail's format, never ours. The value
 * stamped here is stored correctly and is real, it just never matches what
 * the recipient's client actually replies to on its own. Row 108 closes this
 * gap for the Gmail path: after a successful send, execute-one.ts calls
 * {@link fetchDeliveredGmailMessageId} to read back Gmail's own rewritten
 * value and corrects the stored `rfc822MessageId`, so thread-ref reply
 * matching (leg 1 of `processSyncedMessageForReply`) has a real value to
 * match against. This function's return value is still what gets stamped on
 * the outgoing MIME and stored first — the correction is a best-effort
 * follow-up, never a replacement for sending.
 */
export function generateRfc822MessageId(fromEmail: string): string {
  const domain = fromEmail.split("@")[1]?.trim().toLowerCase() || "odoutreach.local";
  return `<${randomUUID()}@${domain}>`;
}

/**
 * H1/H2 — a STABLE Message-ID derived from the OutboundEmail row id, so it is
 * identical across send attempts. This lets a retry look the message up by its
 * Message-ID (`rfc822msgid:`) and reconcile-instead-of-resend if a prior attempt
 * already landed. Same shape as {@link generateRfc822MessageId}; only used when
 * the preflight-dedup flag is on.
 */
export function stableRfc822MessageId(outboundEmailId: string, fromEmail: string): string {
  const domain = fromEmail.split("@")[1]?.trim().toLowerCase() || "odoutreach.local";
  return `<osm-${outboundEmailId}@${domain}>`;
}

/**
 * H1/H2 — ask Gmail whether a message with this exact Message-ID already exists
 * in the mailbox (i.e. a prior attempt was accepted). Uses the `rfc822msgid:`
 * search operator. Never throws — any lookup failure returns `unknown` so the
 * caller falls back to sending (best-effort dedup, never strands a row).
 */
export async function findGmailMessageIdByRfc822MessageId(input: {
  accessToken: string;
  rfc822MessageId: string;
}): Promise<MailboxMessageLookupResult> {
  const bare = input.rfc822MessageId.replace(/^</, "").replace(/>$/, "").trim();
  if (!bare) return { status: "unknown" };
  const url = `${GMAIL_LIST}?q=${encodeURIComponent(`rfc822msgid:${bare}`)}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${input.accessToken}` },
    });
    if (!res.ok) return { status: "unknown" };
    const json = (await res.json()) as { messages?: Array<{ id?: string }> };
    const firstId = json.messages?.[0]?.id;
    if (typeof firstId === "string" && firstId.length > 0) {
      return { status: "found", providerMessageId: `gmail:${firstId}` };
    }
    return { status: "not_found" };
  } catch {
    return { status: "unknown" };
  }
}

/**
 * Row 108 — read back the Message-ID Gmail actually stamped on a message we
 * just sent. Gmail rewrites whatever we supply in the outgoing MIME (see
 * {@link generateRfc822MessageId}'s doc comment and
 * docs/ops/REPLY-MATCHER-LEG1-MEASUREMENT-2026-08-30.md); this is the only
 * way to learn the value a genuine reply's In-Reply-To will actually carry.
 *
 * Best-effort ONLY, by contract: this runs after a real send has already
 * succeeded and must never affect that outcome. Every failure mode — network
 * error, non-2xx response, malformed JSON, a missing header — is swallowed
 * here and reported as `null`. Callers MUST treat `null` as "leave the
 * originally stored value in place" and must never let this function's
 * rejection propagate into the send path.
 */
export async function fetchDeliveredGmailMessageId(input: {
  accessToken: string;
  gmailMessageId: string;
}): Promise<string | null> {
  try {
    const url = `${GMAIL_LIST}/${encodeURIComponent(input.gmailMessageId)}?format=metadata&metadataHeaders=Message-ID`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${input.accessToken}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      payload?: { headers?: Array<{ name?: string; value?: string }> };
    };
    const header = json.payload?.headers?.find(
      (h) => typeof h?.name === "string" && h.name.toLowerCase() === "message-id",
    );
    const value = header?.value?.trim();
    return value ? value : null;
  } catch {
    return null;
  }
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
