import "server-only";

import { normalizeEmail } from "@/lib/normalize";

const GMAIL = "https://gmail.googleapis.com/gmail/v1";

const PREVIEW_MAX = 4000;

export type GmailApiMessageRef = {
  id: string;
  threadId?: string;
};

export type GmailApiMessageDetail = {
  id: string;
  threadId?: string;
  snippet?: string;
  internalDate?: string;
  payload?: { headers?: { name: string; value: string }[] };
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
};

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
    metadata: {
      threadId: msg.threadId != null ? msg.threadId : null,
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
  url.searchParams.set("format", "metadata");
  url.searchParams.append("metadataHeaders", "From");
  url.searchParams.append("metadataHeaders", "To");
  url.searchParams.append("metadataHeaders", "Subject");
  url.searchParams.append("metadataHeaders", "Date");
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = (await res.json().catch(() => ({}))) as GmailApiMessageDetail & {
    error?: { message?: string };
  };
  if (!res.ok) {
    const m = body.error?.message ?? "Gmail get message failed";
    throw new Error(`Gmail message metadata failed: ${m}`);
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
