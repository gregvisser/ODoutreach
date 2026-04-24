import { buildListUnsubscribeHeaders } from "@/lib/unsubscribe/list-unsubscribe-headers";
import { resolvePublicBaseUrl } from "@/lib/unsubscribe/one-click-readiness";
import {
  buildUnsubscribeUrl,
  generateRawUnsubscribeToken,
} from "@/lib/unsubscribe/unsubscribe-token";
import { ensureUnsubscribeLinkInPlainTextBody } from "@/lib/unsubscribe/ensure-unsubscribe-in-body";

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
      rawToken: string;
      listUnsubscribe: string;
      listUnsubscribePost: string;
    }
  | {
      kind: "mailto";
      finalBody: string;
    };

/**
 * Prepares body text and optional List-Unsubscribe metadata for a
 * one-off contact send. Matches sequence dispatch behaviour: hosted URL
 * when `resolvePublicBaseUrl()` is set, otherwise mailto fallback.
 */
export function prepareContactSendCompliance(input: {
  bodyText: string;
  clientDefaultSenderEmail: string | null;
}): ContactSendComplianceResult {
  const publicBase = resolvePublicBaseUrl();
  const mailto = buildUnsubscribeMailtoPlaceholder(input.clientDefaultSenderEmail);

  if (publicBase) {
    const rawToken = generateRawUnsubscribeToken();
    const url = buildUnsubscribeUrl({ baseUrl: publicBase, rawToken });
    const headers = buildListUnsubscribeHeaders(url);
    const finalBody = ensureUnsubscribeLinkInPlainTextBody(input.bodyText, url);
    if (!headers) {
      return { kind: "mailto", finalBody };
    }
    return {
      kind: "hosted",
      rawToken,
      listUnsubscribe: headers.listUnsubscribe,
      listUnsubscribePost: headers.listUnsubscribePost,
      finalBody,
    };
  }

  const link = mailto;
  return {
    kind: "mailto",
    finalBody: ensureUnsubscribeLinkInPlainTextBody(
      input.bodyText,
      link,
    ),
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
