import "server-only";

import type { SendEmailResult } from "@/server/email/providers/types";

const GRAPH = "https://graph.microsoft.com/v1.0";

/**
 * POST /me/sendMail — as the connected mailbox user. `from` is implied by the token;
 * the Outbound row still stores the mailbox address for audit.
 */
export async function sendMicrosoftGraphSendMail(input: {
  accessToken: string;
  to: string;
  subject: string;
  bodyText: string;
  correlationId: string;
}): Promise<SendEmailResult> {
  const { accessToken, to, subject, bodyText, correlationId } = input;
  const res = await fetch(`${GRAPH}/me/sendMail`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: "Text", content: bodyText },
        toRecipients: [{ emailAddress: { address: to } }],
      },
      saveToSentItems: true,
    }),
  });

  if (res.status === 202) {
    return {
      ok: true,
      providerMessageId: `msgraph:sendmail:${correlationId}`,
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
    return { ok: false, error: `Microsoft Graph forbidden (check Mail.Send consent): ${text}`, code: "403" };
  }
  if (res.status >= 500) {
    return { ok: false, error: `Microsoft Graph server error: ${text}`, code: String(res.status) };
  }
  return {
    ok: false,
    error: `Microsoft Graph sendMail failed (${res.status}): ${text}`,
    code: String(res.status),
  };
}
