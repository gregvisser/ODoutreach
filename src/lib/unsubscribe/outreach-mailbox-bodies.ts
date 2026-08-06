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
import { normaliseUnsubscribeMailtoAddress } from "@/lib/unsubscribe/list-unsubscribe-headers";

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
 * Visible opt-out line used on the mailto rail.
 *
 * Deliberately carries NO link. On this rail the whole point is that the email
 * contains no URL on any domain other than the sender's, so the opt-out is an
 * instruction rather than an anchor. Replies are ingested by the normal reply
 * sync and suppressed by `classifyOptOutReply`.
 *
 * Exported so tests and preview surfaces assert the exact same wording the
 * recipient sees.
 */
export const MAILTO_OPT_OUT_LINE =
  "To opt out, reply STOP to this email and we'll remove you.";

/**
 * Rebuilds plain + HTML bodies from the persisted snapshot and mailbox row.
 *
 * Two opt-out rails, mutually exclusive:
 *
 *   * `hostedUnsubscribeUrl` — renders the usual "Unsubscribe" anchor. Only
 *     pass a URL that is safe to show THIS recipient; for a real prospect that
 *     means a sender-aligned domain, never the OpensDoors app domain.
 *   * `mailtoUnsubscribeAddress` — used only when there is no hosted URL.
 *     Renders {@link MAILTO_OPT_OUT_LINE}, adding a visible opt-out with no
 *     link. Without this the no-URL branch produces a body with no opt-out at
 *     all, which is not acceptable for outreach.
 *
 * Passing neither preserves the previous no-footer behaviour exactly, so
 * existing callers are unaffected.
 */
export function buildMailboxGovernedEmailBodies(input: {
  bodySnapshotPlain: string;
  /** Prisma `ClientMailboxIdentity` rows satisfy this shape. */
  mailbox: SenderSignatureMailbox;
  hostedUnsubscribeUrl?: string | null;
  /** Opt-out address for the mailto rail. Ignored when a hosted URL is given. */
  mailtoUnsubscribeAddress?: string | null;
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

  // Mailto rail applies only when no hosted URL is available.
  const mailtoOptOut = url
    ? null
    : normaliseUnsubscribeMailtoAddress(input.mailtoUnsubscribeAddress);

  const plainFinal = url
    ? ensureUnsubscribeLinkInPlainTextBody(plainWithSig, url)
    : mailtoOptOut
      ? `${plainWithSig.replace(/\s+$/u, "")}\n\n---\n${MAILTO_OPT_OUT_LINE}`
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
  } else if (mailtoOptOut) {
    // No link — an instruction only, so the email carries no foreign host.
    const footer = plainTextToHtmlParagraphs(MAILTO_OPT_OUT_LINE);
    const middle = [msgHtml, sigHtmlBlock].filter(Boolean).join("\n");
    html = middle ? `${middle}\n${footer}` : footer;
  } else {
    html = [msgHtml, sigHtmlBlock].filter(Boolean).join("\n");
  }

  return { text: plainFinal, html };
}
