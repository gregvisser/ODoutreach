import "server-only";

import {
  normalizeGmailMessagePayload,
  type GmailPayloadMessage,
  type NormalizedInboundBody,
} from "@/lib/inbox/inbound-body-normalization";

const GMAIL = "https://gmail.googleapis.com/gmail/v1";

export type FetchGmailMessageBodyResult =
  | {
      ok: true;
      providerMessageId: string;
      normalized: NormalizedInboundBody;
    }
  | { ok: false; error: string; errorCode: string };

/**
 * PR P — Fetch a single Gmail message by its providerMessageId (Gmail
 * id) using a delegated access token for the mailbox that owns the
 * InboundMailboxMessage. Returns the normalized safe-text body.
 *
 * The caller is responsible for:
 *   * Loading the `InboundMailboxMessage` scoped to the current client.
 *   * Acquiring the delegated access token for the linked mailbox
 *     identity (never a "default" mailbox).
 *
 * No send is performed.
 */
export async function fetchGmailInboundMessageFullBody(input: {
  accessToken: string;
  providerMessageId: string;
}): Promise<FetchGmailMessageBodyResult> {
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
    `${GMAIL}/users/me/messages/${encodeURIComponent(providerMessageId)}`,
  );
  url.searchParams.set("format", "full");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = (await res.json().catch(() => ({}))) as
    | (GmailPayloadMessage & { id?: string })
    | { error?: { code?: number; message?: string } };

  if (!res.ok) {
    const g = (body as { error?: { code?: number; message?: string } }).error;
    const msg = g?.message ?? "Gmail message fetch failed";
    return {
      ok: false,
      error: `Gmail message fetch failed: ${msg}`,
      errorCode: g?.code != null ? `gmail_${g.code}` : "gmail_http_error",
    };
  }
  const m = body as GmailPayloadMessage & { id?: string };
  if (!m.id) {
    return {
      ok: false,
      error: "Gmail returned no message",
      errorCode: "gmail_empty_response",
    };
  }
  const normalized = normalizeGmailMessagePayload(m);
  return { ok: true, providerMessageId: m.id, normalized };
}
