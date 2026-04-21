import "server-only";

import type { SendEmailResult } from "@/server/email/providers/types";

const GRAPH = "https://graph.microsoft.com/v1.0";

/**
 * POST /me/messages/{id}/reply — sends a reply to a specific inbound
 * message and preserves the original conversation thread automatically.
 * Microsoft Graph assembles the reply using the original subject and
 * recipients; the `comment` body is prepended as the reply text.
 *
 * Requires the mailbox token to have Mail.Send (delegated). Returns 202
 * on success (same shape as /sendMail).
 */
export async function sendMicrosoftGraphReply(input: {
  accessToken: string;
  providerMessageId: string;
  bodyText: string;
  correlationId: string;
}): Promise<SendEmailResult> {
  const { accessToken, providerMessageId, bodyText, correlationId } = input;
  const id = encodeURIComponent(providerMessageId);
  const res = await fetch(`${GRAPH}/me/messages/${id}/reply`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ comment: bodyText }),
  });

  if (res.status === 202) {
    return {
      ok: true,
      providerMessageId: `msgraph:reply:${correlationId}`,
      providerName: "microsoft_graph",
    };
  }

  const text = (await res.text()).slice(0, 2000);
  if (res.status === 429) {
    return { ok: false, error: `Microsoft Graph throttled: ${text}`, code: "429" };
  }
  if (res.status === 401) {
    return { ok: false, error: `Microsoft Graph auth failed: ${text}`, code: "401" };
  }
  if (res.status === 403) {
    return {
      ok: false,
      error: `Microsoft Graph forbidden (check Mail.Send consent): ${text}`,
      code: "403",
    };
  }
  if (res.status === 404) {
    return {
      ok: false,
      error: `Microsoft Graph: original message not found in this mailbox (${text}).`,
      code: "404",
    };
  }
  if (res.status >= 500) {
    return {
      ok: false,
      error: `Microsoft Graph server error: ${text}`,
      code: String(res.status),
    };
  }
  return {
    ok: false,
    error: `Microsoft Graph reply failed (${res.status}): ${text}`,
    code: String(res.status),
  };
}
