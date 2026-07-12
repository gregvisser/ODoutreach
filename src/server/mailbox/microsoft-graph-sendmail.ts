import "server-only";

import type {
  MailboxMessageLookupResult,
  SendEmailResult,
} from "@/server/email/providers/types";

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
  bodyHtml?: string | null;
};

/**
 * When `MICROSOFT_MIME_SEND=on`, Microsoft outreach is submitted as raw MIME
 * (see {@link sendMicrosoftGraphMimeSendMail}) instead of Graph's JSON `sendMail`.
 * The JSON path can only carry ONE body type — so today HTML sends go out
 * HTML-only (no `text/plain` alternative, which scores as spam) and cannot carry
 * a `List-Unsubscribe-Post` one-click header. Raw MIME fixes both. Default off so
 * the send path is unchanged until this is deliberately validated + enabled.
 */
export function isMicrosoftMimeSendEnabled(): boolean {
  return process.env.MICROSOFT_MIME_SEND === "on";
}

/**
 * POST `/users/{mailbox}/sendMail` with a raw MIME message (base64-encoded body,
 * `Content-Type: text/plain`). Unlike the JSON `sendMail` path this carries a
 * real `multipart/alternative` body (a `text/plain` part alongside the HTML) and
 * genuine `List-Unsubscribe` / `List-Unsubscribe-Post` headers — neither of which
 * the JSON path can deliver over Graph. Build the message with the shared
 * `buildRfc5322PlainTextEmail` helper (same one the Gmail path uses in
 * production). Gated by {@link isMicrosoftMimeSendEnabled}.
 */
export async function sendMicrosoftGraphMimeSendMail(input: {
  accessToken: string;
  mailboxUserPrincipalName: string;
  rfc5322Message: string;
  correlationId: string;
}): Promise<SendEmailResult> {
  const userSeg = encodeURIComponent(input.mailboxUserPrincipalName.trim());
  const mimeBase64 = Buffer.from(input.rfc5322Message, "utf8").toString("base64");
  const res = await fetch(`${GRAPH}/users/${userSeg}/sendMail`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "text/plain",
    },
    body: mimeBase64,
  });

  if (res.status === 202) {
    return {
      ok: true,
      providerMessageId: `msgraph:mime:${input.correlationId}`,
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
      error: `Microsoft Graph forbidden (check Mail.Send / Mail.Send.Shared and mailbox delegate rights): ${text}`,
      code: "403",
    };
  }
  if (res.status >= 500) {
    return { ok: false, error: `Microsoft Graph server error: ${text}`, code: String(res.status) };
  }
  return {
    ok: false,
    error: `Microsoft Graph MIME sendMail failed (${res.status}): ${text}`,
    code: String(res.status),
  };
}

type GraphMessagePayload = {
  subject: string;
  body: { contentType: "Text" | "HTML"; content: string };
  toRecipients: Array<{ emailAddress: { address: string } }>;
  singleValueExtendedProperties?: Array<{ id: string; value: string }>;
};

/**
 * POST `/users/{mailbox}/sendMail` — sends from the **declared** workspace mailbox row.
 * The access token belongs to the Microsoft user who completed OAuth (often a delegate);
 * shared `Mail.Send` scopes route the send through the target user's mailbox.
 *
 * `options.listUnsubscribeUrl`, when provided and well-formed, is
 * emitted via the `String 0x1045` single-value extended property so
 * the recipient sees a real `List-Unsubscribe` header. Any other
 * value shape is ignored.
 */
export async function sendMicrosoftGraphSendMail(input: {
  accessToken: string;
  /** Target mailbox UPN / SMTP address (row `emailNormalized`). */
  mailboxUserPrincipalName: string;
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string | null;
  correlationId: string;
  options?: GraphSendMailOptions;
}): Promise<SendEmailResult> {
  const {
    accessToken,
    mailboxUserPrincipalName,
    to,
    subject,
    bodyText,
    bodyHtml,
    correlationId,
    options,
  } = input;
  const userSeg = encodeURIComponent(mailboxUserPrincipalName.trim());
  const html = bodyHtml?.trim() || options?.bodyHtml?.trim();
  const message: GraphMessagePayload = {
    subject,
    body: html
      ? { contentType: "HTML", content: html }
      : { contentType: "Text", content: bodyText },
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

  const res = await fetch(`${GRAPH}/users/${userSeg}/sendMail`, {
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
    return {
      ok: false,
      error: `Microsoft Graph forbidden (check Mail.Send / Mail.Send.Shared and mailbox delegate rights): ${text}`,
      code: "403",
    };
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

/**
 * H1/H2 — best-effort preflight: did this message already land in Sent Items?
 *
 * Graph's JSON `sendMail` cannot stamp our own Message-ID (it rejects non-`x-`
 * headers) and returns no message id, so — unlike Gmail — we cannot look up by
 * a stable id. Instead we search Sent Items for a message to the same recipient
 * with the same subject since `sinceIso` (the prior claim window). This is
 * inherently fuzzy (same subject to the same recipient could collide); it is
 * gated behind the preflight flag and documented as best-effort. Never throws —
 * any failure returns `unknown` and the caller falls back to sending.
 */
export async function findGraphSentMessageId(input: {
  accessToken: string;
  mailboxUserPrincipalName: string;
  to: string;
  subject: string;
  sinceIso: string;
}): Promise<MailboxMessageLookupResult> {
  const userSeg = encodeURIComponent(input.mailboxUserPrincipalName.trim());
  const subjectEsc = input.subject.replace(/'/g, "''");
  const filter = `sentDateTime ge ${input.sinceIso} and subject eq '${subjectEsc}'`;
  const url =
    `${GRAPH}/users/${userSeg}/mailFolders/SentItems/messages` +
    `?$filter=${encodeURIComponent(filter)}` +
    `&$select=id,toRecipients,sentDateTime&$top=25`;
  const wantTo = input.to.trim().toLowerCase();
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${input.accessToken}` },
    });
    if (!res.ok) return { status: "unknown" };
    const json = (await res.json()) as {
      value?: Array<{
        id?: string;
        toRecipients?: Array<{ emailAddress?: { address?: string } }>;
      }>;
    };
    const match = (json.value ?? []).find((m) =>
      (m.toRecipients ?? []).some(
        (r) => r.emailAddress?.address?.trim().toLowerCase() === wantTo,
      ),
    );
    if (match?.id) {
      return { status: "found", providerMessageId: `msgraph:${match.id}` };
    }
    return { status: "not_found" };
  } catch {
    return { status: "unknown" };
  }
}
