import "server-only";

import { normalizeMicrosoftMessageBody } from "@/lib/inbox/inbound-body-normalization";
import { normalizeEmail } from "@/lib/normalize";

const GRAPH = "https://graph.microsoft.com/v1.0";

export type MicrosoftGraphInboxListResponse = {
  value?: MicrosoftGraphMessage[];
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
};

const PREVIEW_MAX = 4000;

/**
 * Fetches the most recent inbox messages for the signed-in Graph user (delegated token).
 */
export async function listMicrosoftGraphInboxMessages(
  accessToken: string,
  options: { top?: number } = {},
): Promise<MicrosoftGraphMessage[]> {
  const top = Math.min(Math.max(options.top ?? 25, 1), 50);
  const url = new URL(`${GRAPH}/me/mailFolders/inbox/messages`);
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
    ].join(","),
  );
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const body = (await res.json().catch(() => ({}))) as
    | MicrosoftGraphInboxListResponse
    | { error?: { code?: string; message?: string } };
  if (!res.ok) {
    const g = (body as { error?: { message?: string; code?: string } }).error;
    const m = g?.message ?? (typeof (body as { error?: string }).error === "string" ? (body as { error: string }).error : "Graph request failed");
    throw new Error(
      g?.code ? `Graph Mail.Read failed: ${g.code} — ${m}` : `Graph request failed: ${m}`,
    );
  }
  const v = (body as MicrosoftGraphInboxListResponse).value;
  if (!v || !Array.isArray(v)) {
    return [];
  }
  return v;
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
  return {
    providerMessageId: msg.id,
    fromEmail,
    toEmail,
    subject: msg.subject != null ? msg.subject : null,
    snippet: null,
    bodyPreview: preview,
    receivedAt: received,
    conversationId: msg.conversationId != null ? msg.conversationId : null,
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
