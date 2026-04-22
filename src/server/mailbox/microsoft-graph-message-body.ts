import "server-only";

import {
  normalizeMicrosoftMessageBody,
  type NormalizedInboundBody,
} from "@/lib/inbox/inbound-body-normalization";

const GRAPH = "https://graph.microsoft.com/v1.0";

export type MicrosoftGraphFullMessage = {
  id?: string;
  subject?: string;
  bodyPreview?: string;
  body?: { content?: string; contentType?: string };
  conversationId?: string;
  receivedDateTime?: string;
  internetMessageId?: string;
};

export type FetchMicrosoftMessageBodyResult =
  | {
      ok: true;
      providerMessageId: string;
      normalized: NormalizedInboundBody;
      rawContentType: string | null;
    }
  | { ok: false; error: string; errorCode: string };

/**
 * PR P — Fetch a single Microsoft Graph message by its providerMessageId
 * using a delegated access token for the mailbox that owns the
 * InboundMailboxMessage. Returns the normalized safe-text body.
 *
 * The caller is responsible for:
 *   * Loading the `InboundMailboxMessage` scoped to the current client.
 *   * Acquiring the delegated access token for the linked mailbox
 *     identity (never a "default" mailbox).
 *
 * No send, no suppression, no app-setting change is performed here.
 */
export async function fetchMicrosoftInboundMessageFullBody(input: {
  accessToken: string;
  providerMessageId: string;
}): Promise<FetchMicrosoftMessageBodyResult> {
  const { accessToken, providerMessageId } = input;
  if (!accessToken) {
    return { ok: false, error: "Missing access token", errorCode: "no_token" };
  }
  if (!providerMessageId) {
    return {
      ok: false,
      error: "Missing providerMessageId",
      errorCode: "no_message_id",
    };
  }
  const url = new URL(
    `${GRAPH}/me/messages/${encodeURIComponent(providerMessageId)}`,
  );
  url.searchParams.set(
    "$select",
    ["id", "subject", "body", "bodyPreview", "receivedDateTime", "conversationId", "internetMessageId"].join(","),
  );

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = (await res.json().catch(() => ({}))) as
    | MicrosoftGraphFullMessage
    | { error?: { code?: string; message?: string } };

  if (!res.ok) {
    const g = (body as { error?: { code?: string; message?: string } }).error;
    const msg = g?.message ?? "Graph message fetch failed";
    return {
      ok: false,
      error: `Graph message fetch failed: ${msg}`,
      errorCode: g?.code ?? "graph_http_error",
    };
  }

  const m = body as MicrosoftGraphFullMessage;
  if (!m.id) {
    return {
      ok: false,
      error: "Graph returned no message",
      errorCode: "graph_empty_response",
    };
  }
  const normalized = normalizeMicrosoftMessageBody(m.body, m.bodyPreview ?? null);
  return {
    ok: true,
    providerMessageId: m.id,
    normalized,
    rawContentType: m.body?.contentType ?? null,
  };
}
