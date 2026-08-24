import "server-only";

import { normalizeEmail } from "@/lib/normalize";

const GMAIL = "https://gmail.googleapis.com/gmail/v1";

const PREVIEW_MAX = 4000;

export type GmailApiMessageRef = {
  id: string;
  threadId?: string;
};

export type GmailMessagePart = {
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailMessagePart[];
};

export type GmailApiMessageDetail = {
  id: string;
  threadId?: string;
  snippet?: string;
  internalDate?: string;
  sizeEstimate?: number;
  payload?: GmailMessagePart & { headers?: { name: string; value: string }[] };
};

export type MappedGmailInboxRow = {
  providerMessageId: string;
  fromEmail: string;
  toEmail: string | null;
  subject: string | null;
  snippet: string | null;
  bodyPreview: string | null;
  receivedAt: Date;
  conversationId: string | null;
  metadata: Record<string, string | null | boolean>;
  /** RFC 5322 In-Reply-To header value. Non-null only for genuine thread replies. */
  inReplyToHeader: string | null;
  /**
   * The decoded message body. Mirrors MappedInboxRow.fullBody on the Microsoft
   * side so both providers feed the same downstream consumers.
   *
   * Added 2026-08-24. This fetch used format=metadata and never retrieved a body
   * at all, so every Google message reached the bounce classifier and the
   * opt-out classifier as Gmail's ~200-character snippet. Measured on
   * production that day: 355 Gmail messages, SEVEN with any bodyText, average
   * length 57 characters -- against 6,240 Microsoft messages averaging 4,023.
   * Of 147 real Gmail NDRs, not one had a body for the parser to read.
   */
  fullBody: {
    bodyText: string;
    bodyContentType: "text" | "html" | "multipart";
    fullBodySize: number;
    fullBodySource: "GMAIL_API";
    fullBodyFetchedAt: Date;
  } | null;
};

/** Gmail returns base64url with no padding. */
function decodeGmailBody(data: string | undefined): string {
  if (!data) return "";
  try {
    return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  } catch {
    return "";
  }
}

/** Crude tag strip, only ever applied when no text/plain part exists. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, NL)
    .replace(/<\/p>/gi, NL)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ 	]{2,}/g, " ")
    .trim();
}

/**
 * Pull the readable body out of a Gmail payload tree.
 *
 * Prefers text/plain anywhere in the tree, falls back to text/html stripped of
 * tags, and ignores attachments (a part with a filename, or a body that is only
 * an attachmentId). Exported so the traversal is unit-testable without a live
 * Gmail response.
 */
const NL = String.fromCharCode(10);

export function extractGmailBody(
  payload: GmailMessagePart | undefined,
): { text: string; contentType: "text" | "html" | "multipart" } {
  if (!payload) return { text: "", contentType: "multipart" };

  const plain: string[] = [];
  const html: string[] = [];

  const walk = (part: GmailMessagePart | undefined): void => {
    if (!part) return;
    // Attachments carry no readable body for our purposes.
    if (part.filename && part.filename.length > 0) return;
    const mime = (part.mimeType ?? "").toLowerCase();
    const data = part.body?.data;
    if (data && mime === "text/plain") plain.push(decodeGmailBody(data));
    else if (data && mime === "text/html") html.push(decodeGmailBody(data));
    else if (data && !mime.startsWith("multipart/") && plain.length === 0 && html.length === 0) {
      // Single-part message with an unlabelled or unusual mime type.
      plain.push(decodeGmailBody(data));
    }
    for (const child of part.parts ?? []) walk(child);
  };
  walk(payload);

  if (plain.length > 0) return { text: plain.join(NL).trim(), contentType: "text" };
  if (html.length > 0) return { text: htmlToText(html.join(NL)), contentType: "html" };
  return { text: "", contentType: "multipart" };
}

function headerValue(
  headers: { name: string; value: string }[] | undefined,
  name: string,
): string | null {
  if (!headers) return null;
  const h = headers.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h?.value?.trim() ?? null;
}

/**
 * Extract a single RFC 5322 address from From / To style headers.
 */
export function parseEmailFromHeader(v: string | null): string | null {
  if (!v) return null;
  const angle = v.match(/<([^>]+@[^>]+)>/);
  const raw = angle ? angle[1].trim() : v.trim();
  if (!raw.includes("@")) return null;
  return normalizeEmail(raw);
}

/**
 * Map a Gmail metadata response into persistable row fields. Pure for unit tests.
 */
export function mapGmailMessageToRow(msg: GmailApiMessageDetail): MappedGmailInboxRow | null {
  if (!msg.id) return null;
  const headers = msg.payload?.headers;
  const fromRaw = headerValue(headers, "From");
  const fromEmail = parseEmailFromHeader(fromRaw);
  if (!fromEmail) return null;
  const toEmail = parseEmailFromHeader(headerValue(headers, "To"));
  const subject = headerValue(headers, "Subject");
  const snippet = msg.snippet != null ? clip(msg.snippet, PREVIEW_MAX) : null;
  const receivedAt =
    msg.internalDate != null && /^\d+$/.test(msg.internalDate)
      ? new Date(Number.parseInt(msg.internalDate, 10))
      : new Date();
  return {
    providerMessageId: msg.id,
    fromEmail,
    toEmail,
    subject: subject != null ? subject : null,
    snippet,
    bodyPreview: snippet,
    receivedAt,
    conversationId: msg.threadId != null ? msg.threadId : null,
    inReplyToHeader: headerValue(headers, "In-Reply-To"),
    fullBody: (() => {
      const b = extractGmailBody(msg.payload);
      if (b.text.trim().length === 0) return null;
      return {
        bodyText: b.text,
        bodyContentType: b.contentType,
        fullBodySize: msg.sizeEstimate ?? b.text.length,
        fullBodySource: "GMAIL_API" as const,
        fullBodyFetchedAt: new Date(),
      };
    })(),
    metadata: {
      threadId: msg.threadId != null ? msg.threadId : null,
      // PR Q — capture Gmail's `internalDate` so future fetch/debug has
      // a provider-stable timestamp (in ms since epoch, as Gmail returns).
      internalDate: msg.internalDate != null ? msg.internalDate : null,
      // RFC 5322 Message-ID header is a stable cross-provider identifier;
      // Gmail exposes it via the "Message-ID" (or "Message-Id") header.
      rfc822MessageId:
        headerValue(headers, "Message-ID") ??
        headerValue(headers, "Message-Id") ??
        null,
    },
  };
}

function clip(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n);
}

/**
 * Lists recent INBOX message ids (newest activity first is not guaranteed by list alone;
 * we fetch metadata per id).
 */
export async function listGmailInboxMessageRefs(
  accessToken: string,
  options: { maxResults?: number } = {},
): Promise<GmailApiMessageRef[]> {
  const max = Math.min(Math.max(options.maxResults ?? 25, 1), 50);
  const url = new URL(`${GMAIL}/users/me/messages`);
  url.searchParams.set("maxResults", String(max));
  url.searchParams.set("labelIds", "INBOX");
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = (await res.json().catch(() => ({}))) as {
    messages?: GmailApiMessageRef[];
    error?: { message?: string; code?: number };
  };
  if (!res.ok) {
    const g = body.error;
    const m = g?.message ?? "Gmail list failed";
    throw new Error(`Gmail inbox list failed: ${m}`);
  }
  const v = body.messages;
  if (!v || !Array.isArray(v)) {
    return [];
  }
  return v;
}

export async function getGmailMessageMetadata(
  accessToken: string,
  messageId: string,
): Promise<GmailApiMessageDetail | null> {
  const url = new URL(`${GMAIL}/users/me/messages/${encodeURIComponent(messageId)}`);
  // format=full, not metadata. `metadata` returns headers only and NO body at
  // all, which is why every Google message reached the bounce and opt-out
  // classifiers as a ~200 character snippet. `full` returns the same headers
  // (so the metadataHeaders list below is no longer needed - full carries them
  // all) plus the decoded payload tree. Costs 5 quota units per message instead
  // of 5 - Gmail prices messages.get the same either way - but the responses
  // are larger, which is the real trade.
  url.searchParams.set("format", "full");
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = (await res.json().catch(() => ({}))) as GmailApiMessageDetail & {
    error?: { message?: string };
  };
  if (!res.ok) {
    const m = body.error?.message ?? "Gmail get message failed";
    throw new Error(`Gmail message fetch failed: ${m}`);
  }
  return body.id ? body : null;
}

/**
 * Fetches recent inbox messages with metadata for persistence.
 */
export async function fetchGmailInboxMessagesForSync(
  accessToken: string,
  options: { maxResults?: number } = {},
): Promise<MappedGmailInboxRow[]> {
  const refs = await listGmailInboxMessageRefs(accessToken, options);
  const out: MappedGmailInboxRow[] = [];
  for (const ref of refs) {
    const detail = await getGmailMessageMetadata(accessToken, ref.id);
    if (!detail) continue;
    const row = mapGmailMessageToRow(detail);
    if (row) out.push(row);
  }
  return out;
}
