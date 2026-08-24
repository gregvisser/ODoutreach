import { buildListUnsubscribeHeaders } from "@/lib/unsubscribe/list-unsubscribe-headers";
import {
  buildOneClickUnsubscribeUrl,
  buildUnsubscribeUrl,
  generateRawUnsubscribeToken,
} from "@/lib/unsubscribe/unsubscribe-token";
import { ensureUnsubscribeLinkInPlainTextBody } from "@/lib/unsubscribe/ensure-unsubscribe-in-body";
import {
  buildEmailBodyParts,
  type EmailBodyParts,
} from "@/lib/unsubscribe/email-body-parts";

/**
 * When one-click is not configured, use the same mailto shape as
 * sequence dispatch so `{{unsubscribe_link}}` and one-off bodies stay
 * consistent.
 */
export function buildUnsubscribeMailtoPlaceholder(
  clientDefaultSenderEmail: string | null,
): string {
  if (!clientDefaultSenderEmail?.trim()) {
    return "";
  }
  return `mailto:${clientDefaultSenderEmail.trim()}?subject=unsubscribe`;
}

export type ContactSendComplianceResult =
  | {
      kind: "hosted";
      finalBody: string;
      bodyParts: EmailBodyParts;
      rawToken: string;
      listUnsubscribe: string;
      listUnsubscribePost: string;
    }
  | {
      kind: "mailto";
      finalBody: string;
      bodyParts: EmailBodyParts;
    };

/**
 * Prepares body text and optional List-Unsubscribe metadata for a
 * one-off contact send: hosted URL when the caller supplies a base URL that is
 * safe for THIS recipient, otherwise the mailto fallback.
 *
 * `hostedBaseUrl` is a REQUIRED parameter and is deliberately not read from the
 * environment. It used to call `resolvePublicBaseUrl()` itself, which returns
 * the OpensDoors app domain (`AUTH_URL`) — so a one-off send to a real prospect
 * planted an unsubscribe link on a domain with no relationship to the sender.
 * That is the link misalignment recorded as the 2026 quarantine root cause, and
 * the sequence dispatcher was fixed for it while this path was not. Making the
 * value an explicit argument means no caller can inherit it by accident: each
 * one has to state which base URL is safe for the recipient it is emailing.
 *
 * Pass `null` for a real prospect with no verified aligned link domain — the
 * result is the mailto rail, which is a genuinely usable opt-out and carries no
 * foreign host.
 */
export function prepareContactSendCompliance(input: {
  bodyText: string;
  clientDefaultSenderEmail: string | null;
  hostedBaseUrl: string | null;
}): ContactSendComplianceResult {
  const publicBase = input.hostedBaseUrl?.trim().replace(/\/+$/, "") || null;
  const mailto = buildUnsubscribeMailtoPlaceholder(input.clientDefaultSenderEmail);

  if (publicBase) {
    const rawToken = generateRawUnsubscribeToken();
    const url = buildUnsubscribeUrl({ baseUrl: publicBase, rawToken });
    // H1 — the List-Unsubscribe HEADER must point at the POST-capable
    // `/api/unsubscribe/<token>` (one-click), not the GET-only page `url`.
    const oneClickUrl = buildOneClickUnsubscribeUrl({ baseUrl: publicBase, rawToken });
    const headers = buildListUnsubscribeHeaders(oneClickUrl);
    const finalBody = ensureUnsubscribeLinkInPlainTextBody(input.bodyText, url);
    const bodyParts = buildEmailBodyParts({
      bodyText: finalBody,
      unsubscribeUrl: url,
    });
    if (!headers) {
      return { kind: "mailto", finalBody, bodyParts };
    }
    return {
      kind: "hosted",
      bodyParts,
      rawToken,
      listUnsubscribe: headers.listUnsubscribe,
      listUnsubscribePost: headers.listUnsubscribePost,
      finalBody,
    };
  }

  const link = mailto;
  const finalBody = ensureUnsubscribeLinkInPlainTextBody(input.bodyText, link);
  return {
    kind: "mailto",
    finalBody,
    bodyParts: buildEmailBodyParts({
      bodyText: finalBody,
      unsubscribeUrl: link,
    }),
  };
}

export function complianceMetadata(
  c: ContactSendComplianceResult,
): { headers: { listUnsubscribe: string; listUnsubscribePost: string } } | undefined {
  if (c.kind !== "hosted") {
    return undefined;
  }
  return {
    headers: {
      listUnsubscribe: c.listUnsubscribe,
      listUnsubscribePost: c.listUnsubscribePost,
    },
  };
}
