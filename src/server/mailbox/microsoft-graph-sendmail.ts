import "server-only";

import type { SendEmailResult } from "@/server/email/providers/types";

const GRAPH = "https://graph.microsoft.com/v1.0";

/**
 * MAPI property id for the internet `List-Unsubscribe` header.
 * Microsoft Graph rejects `internetMessageHeaders` whose names do not
 * begin with `x-`/`X-`, so the documented workaround for the standard
 * `List-Unsubscribe` header is to emit the value via a single-value
 * extended property with id `String 0x1045` (`PR_LIST_UNSUBSCRIBE`).
 * There is no corresponding MAPI property for `List-Unsubscribe-Post`
 * over the JSON `sendMail` path — that header cannot be delivered
 * here without switching to raw MIME upload, and is intentionally
 * skipped rather than faked.
 */
const LIST_UNSUBSCRIBE_MAPI_ID = "String 0x1045";

export type GraphSendMailOptions = {
  /** Hosted `List-Unsubscribe` URL (not wrapped in angle brackets). */
  listUnsubscribeUrl?: string | null;
};

type GraphMessagePayload = {
  subject: string;
  body: { contentType: "Text" | "HTML"; content: string };
  toRecipients: Array<{ emailAddress: { address: string } }>;
  singleValueExtendedProperties?: Array<{ id: string; value: string }>;
};

/**
 * POST /me/sendMail — as the connected mailbox user. `from` is implied by the token;
 * the Outbound row still stores the mailbox address for audit.
 *
 * `options.listUnsubscribeUrl`, when provided and well-formed, is
 * emitted via the `String 0x1045` single-value extended property so
 * the recipient sees a real `List-Unsubscribe` header. Any other
 * value shape is ignored.
 */
export async function sendMicrosoftGraphSendMail(input: {
  accessToken: string;
  to: string;
  subject: string;
  bodyText: string;
  correlationId: string;
  options?: GraphSendMailOptions;
}): Promise<SendEmailResult> {
  const { accessToken, to, subject, bodyText, correlationId, options } = input;
  const message: GraphMessagePayload = {
    subject,
    body: { contentType: "Text", content: bodyText },
    toRecipients: [{ emailAddress: { address: to } }],
  };

  const rawUnsub = options?.listUnsubscribeUrl;
  if (typeof rawUnsub === "string") {
    const trimmed = rawUnsub.trim();
    if (
      trimmed &&
      !/[\r\n]/.test(trimmed) &&
      (trimmed.startsWith("https://") || trimmed.startsWith("http://"))
    ) {
      message.singleValueExtendedProperties = [
        {
          id: LIST_UNSUBSCRIBE_MAPI_ID,
          value: `<${trimmed}>`,
        },
      ];
    }
  }

  const res = await fetch(`${GRAPH}/me/sendMail`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
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
