/**
 * Single assembly point for governed mailbox sends: message → branded
 * signature/disclaimer → unsubscribe. Ensures HTML carries
 * `senderSignatureHtml` before the unsubscribe anchor.
 */

import {
  chooseSignatureForSend,
  normaliseSignatureHtml,
  type SenderSignatureMailbox,
} from "@/lib/mailboxes/sender-signature";

import {
  buildCleanUnsubscribeHtmlBody,
  escapeHtmlAttr,
  extractUnsubscribeUrlFromPlainTextBody,
  plainTextToHtmlParagraphs,
  stripPlainTextUnsubscribeFooter,
  type EmailBodyParts,
} from "@/lib/unsubscribe/email-body-parts";
import { ensureUnsubscribeLinkInPlainTextBody } from "@/lib/unsubscribe/ensure-unsubscribe-in-body";

export function stripTrailingPlainSignature(
  messageBody: string,
  signatureText: string | null,
): string {
  if (!signatureText?.trim()) return messageBody.replace(/\s+$/u, "");
  const sig = signatureText.trim();
  const b = messageBody.replace(/\s+$/u, "");
  if (b.endsWith(sig)) return b.slice(0, -sig.length).trimEnd();
  const withSep = `\n\n${sig}`;
  if (b.endsWith(withSep)) return b.slice(0, -withSep.length).trimEnd();
  return messageBody.replace(/\s+$/u, "");
}

/**
 * Rebuilds plain + HTML bodies from the persisted snapshot and mailbox row.
 */
export function buildMailboxGovernedEmailBodies(input: {
  bodySnapshotPlain: string;
  /** Prisma `ClientMailboxIdentity` rows satisfy this shape. */
  mailbox: SenderSignatureMailbox;
  hostedUnsubscribeUrl?: string | null;
}): EmailBodyParts {
  const hosted = input.hostedUnsubscribeUrl?.trim() || null;
  const extracted = extractUnsubscribeUrlFromPlainTextBody(input.bodySnapshotPlain);
  const url = hosted ?? extracted ?? null;

  let bodyNoFooter = input.bodySnapshotPlain;
  if (url) {
    bodyNoFooter = stripPlainTextUnsubscribeFooter(input.bodySnapshotPlain);
  }

  const sel = chooseSignatureForSend({
    mailbox: input.mailbox,
    clientBrief: { senderDisplayNameFallback: null, emailSignatureFallback: null },
  });
  const sigText = sel.emailSignatureText?.trim() ?? "";

  const messageCore = stripTrailingPlainSignature(bodyNoFooter, sigText ? sigText : null);

  const plainWithSig = sigText
    ? `${messageCore.replace(/\s+$/u, "")}\n\n${sigText}`
    : messageCore.replace(/\s+$/u, "");

  const plainFinal = url
    ? ensureUnsubscribeLinkInPlainTextBody(plainWithSig, url)
    : plainWithSig;

  const normHtml = normaliseSignatureHtml(input.mailbox.senderSignatureHtml);
  const msgHtml = plainTextToHtmlParagraphs(messageCore);

  const sigHtmlBlock = (() => {
    if (normHtml.length > 0) {
      return `<div class="od-outreach-signature">${normHtml}</div>`;
    }
    if (sigText.length > 0) {
      return `<div class="od-outreach-signature">${plainTextToHtmlParagraphs(sigText)}</div>`;
    }
    return "";
  })();

  let html: string;
  if (url) {
    const footer = `<p><a href="${escapeHtmlAttr(url)}">Unsubscribe</a></p>`;
    const middle = [msgHtml, sigHtmlBlock].filter(Boolean).join("\n");
    html = middle
      ? `${middle}\n${footer}`
      : buildCleanUnsubscribeHtmlBody({ bodyText: plainFinal, unsubscribeUrl: url });
  } else {
    html = [msgHtml, sigHtmlBlock].filter(Boolean).join("\n");
  }

  return { text: plainFinal, html };
}
