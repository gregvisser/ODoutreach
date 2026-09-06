import "server-only";
import { InboxCursorExpiredError, type InboxPageOptions } from "./inbox-pagination";

import { normalizeMicrosoftMessageBody } from "@/lib/inbox/inbound-body-normalization";
import { normalizeEmail } from "@/lib/normalize";

const GRAPH = "https://graph.microsoft.com/v1.0";

function isDeclaredInboxPath(pathname: string, mailbox: string): boolean {
  let decoded: string;
  try { decoded = decodeURIComponent(pathname); } catch { return false; }
  // Graph may canonicalize slash keys to OData quoted keys, or return an
  // unescaped @. Compare the resource identity, not its URL spelling.
  const match = decoded.match(/^\/v1\.0\/users(?:\/([^/]+)|\('((?:[^']|'')+)'\))\/mailFolders(?:\/inbox|\('inbox'\))\/messages\/?$/i);
  const user = match?.[1] ?? match?.[2]?.replace(/''/g, "'");
  return user !== undefined && normalizeEmail(user) === normalizeEmail(mailbox);
}

export type MicrosoftGraphInboxListResponse = {
  value?: MicrosoftGraphMessage[];
  "@odata.nextLink"?: string;
};

export type MicrosoftGraphMessage = {
  id?: string;
  subject?: string;
  bodyPreview?: string;
  body?: { content?: string; contentType?: string };
  from?: { emailAddress?: { address?: string; name?: string } };
  toRecipients?: { emailAddress?: { address?: string; name?: string } }[];
  receivedDateTime?: string;
  conversationId?: string;
  internetMessageId?: string;
  /** All RFC 5322 internet headers. Used to extract In-Reply-To for reply filtering. */
  internetMessageHeaders?: { name: string; value: string }[];
};

const PREVIEW_MAX = 4000;

/**
 * Fetches the most recent inbox messages for a **declared** workspace mailbox (delegated token).
 */
export async function listMicrosoftGraphInboxMessages(
  accessToken: string,
  mailboxUserPrincipalName: string,
  options: { top?: number } & InboxPageOptions = {},
): Promise<MicrosoftGraphMessage[]> {
  const top = Math.min(Math.max(options.top ?? 25, 1), 50);
  const userSeg = encodeURIComponent(mailboxUserPrincipalName.trim());
  const url = new URL(`${GRAPH}/users/${userSeg}/mailFolders/inbox/messages`);
  url.searchParams.set("$top", String(top));
  url.searchParams.set("$orderby", "receivedDateTime desc");
  url.searchParams.set(
    "$select",
    [
      "id",
      "subject",
      "from",
      "toRecipients",
      "receivedDateTime",
      "bodyPreview",
      "body",
      "conversationId",
      "internetMessageId",
      // Required for reply filtering: In-Reply-To header signals a genuine thread reply.
      "internetMessageHeaders",
    ].join(","),
  );
  const messages: MicrosoftGraphMessage[] = [];
  const seenPages = new Set<string>();
  const seenMessages = new Set<string>();
  let next: string | undefined = options.cursor || url.toString();
  while (next) {
    const pageUrl = new URL(next);
    // Never forward a mailbox token to a different host, user, or resource.
    if (pageUrl.origin !== url.origin || !isDeclaredInboxPath(pageUrl.pathname, mailboxUserPrincipalName) ||
        pageUrl.username || pageUrl.password || pageUrl.hash) {
      throw new Error("Graph inbox returned an unsafe continuation URL");
    }
    if (seenPages.has(next) || seenPages.size >= 1000) {
      throw new Error("Graph inbox pagination did not complete; retry required");
    }
    seenPages.add(next);
    const res = await fetch(next, {
      headers: { Authorization: `Bearer ${accessToken}` },
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
    const body = await res.json() as MicrosoftGraphInboxListResponse & {
      error?: { code?: string; message?: string };
    };
    if (options.cursor && (res.status === 400 || res.status === 410)) {
      throw new InboxCursorExpiredError("Graph inbox continuation expired; restart required");
    }
    if (!res.ok) {
      throw new Error(`Graph Mail.Read failed: ${body.error?.code ?? res.status} — ${body.error?.message ?? "Graph request failed"}`);
    }
    if (!Array.isArray(body.value)) {
      throw new Error("Graph inbox returned an invalid message page");
    }
    for (const message of body.value) {
      if (!message.id || !seenMessages.has(message.id)) messages.push(message);
      if (message.id) seenMessages.add(message.id);
    }
    const continuation = body["@odata.nextLink"];
    if (continuation !== undefined && typeof continuation !== "string") {
      throw new Error("Graph inbox returned an invalid continuation URL");
    }
    next = continuation || undefined;
    if (options.onContinuation && seenPages.size >= (options.maxPages ?? 1000)) break;
  }
  options.onContinuation?.(next ?? null);
  return messages;
}

export type MappedInboxRow = {
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
   * PR P — full-body cache fields extracted from Graph `message.body`.
   * When Graph returns a usable body, we normalize it to safe plain
   * text at ingest time so operators can read the whole reply without
   * an extra fetch. `null` when Graph did not include a body payload.
   */
  fullBody: {
    bodyText: string;
    bodyContentType: "text" | "html" | "multipart";
    fullBodySize: number;
    fullBodySource: "MICROSOFT_GRAPH";
    fullBodyFetchedAt: Date;
  } | null;
};

/**
 * Map a single Graph message into persistable row fields. Pure for unit tests.
 */
export function mapGraphInboxMessageToRow(
  msg: MicrosoftGraphMessage,
): MappedInboxRow | null {
  if (!msg.id) return null;
  const rawFrom = msg.from?.emailAddress?.address?.trim();
  if (!rawFrom) {
    return null;
  }
  const fromEmail = normalizeEmail(rawFrom);
  const to0 = msg.toRecipients?.[0]?.emailAddress?.address?.trim();
  const toEmail = to0 ? normalizeEmail(to0) : null;
  const received = msg.receivedDateTime
    ? new Date(msg.receivedDateTime)
    : new Date();
  const preview =
    msg.bodyPreview != null
      ? clip(msg.bodyPreview, PREVIEW_MAX)
      : msg.body?.content
        ? clip(stripHtmlLight(msg.body.content), PREVIEW_MAX)
        : null;
  const normalized = normalizeMicrosoftMessageBody(
    msg.body ?? null,
    msg.bodyPreview ?? null,
  );
  const fullBody: MappedInboxRow["fullBody"] =
    normalized.contentType !== "empty" && normalized.text.trim().length > 0
      ? {
          bodyText: normalized.text,
          bodyContentType: normalized.contentType,
          fullBodySize: normalized.size,
          fullBodySource: "MICROSOFT_GRAPH",
          fullBodyFetchedAt: new Date(),
        }
      : null;
  const inReplyToHeader =
    (msg.internetMessageHeaders ?? []).find(
      (h) => h.name.toLowerCase() === "in-reply-to",
    )?.value?.trim() ?? null;

  return {
    providerMessageId: msg.id,
    fromEmail,
    toEmail,
    subject: msg.subject != null ? msg.subject : null,
    snippet: null,
    bodyPreview: preview,
    receivedAt: received,
    conversationId: msg.conversationId != null ? msg.conversationId : null,
    inReplyToHeader,
    metadata: {
      internetMessageId: msg.internetMessageId != null ? msg.internetMessageId : null,
    },
    fullBody,
  };
}

function clip(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n);
}

function stripHtmlLight(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
