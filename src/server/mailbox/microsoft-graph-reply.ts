import "server-only";

import type { SendEmailResult } from "@/server/email/providers/types";

const GRAPH = "https://graph.microsoft.com/v1.0";

/**
 * POST `/users/{mailbox}/messages/{id}/reply` — reply in the **declared** mailbox's thread.
 *
 * Requires delegated Mail.Send (and typically Mail.Send.Shared when the OAuth
 * actor differs from the mailbox row). Returns 202 on success.
 */
export async function sendMicrosoftGraphReply(input: {
  accessToken: string;
  mailboxUserPrincipalName: string;
  providerMessageId: string;
  bodyText: string;
  correlationId: string;
}): Promise<SendEmailResult> {
  const { accessToken, mailboxUserPrincipalName, providerMessageId, bodyText, correlationId } =
    input;
  const userSeg = encodeURIComponent(mailboxUserPrincipalName.trim());
  const id = encodeURIComponent(providerMessageId);
  const res = await fetch(`${GRAPH}/users/${userSeg}/messages/${id}/reply`, {
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
      error: `Microsoft Graph forbidden (check Mail.Send / Mail.Send.Shared and delegate rights): ${text}`,
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
