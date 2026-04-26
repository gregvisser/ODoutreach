import { ensureUnsubscribeLinkInPlainTextBody } from "@/lib/unsubscribe/ensure-unsubscribe-in-body";

import {
  chooseSignatureForSend,
  type SenderSignatureClientBriefFallback,
  type SenderSignatureMailbox,
  type SenderSignatureSelection,
} from "./sender-signature";

/**
 * Non-secret sample URL for layout only — not a real unsubscribe token.
 * Production `ensureUnsubscribeLinkInPlainTextBody` is called the same way with a
 * real per-recipient URL; this value must never be persisted.
 */
export const MAILBOX_SIGNATURE_PREVIEW_UNSUBSCRIBE_URL =
  "https://opensdoors.bidlow.co.uk/unsubscribe/preview" as const;

export type MailboxSignatureSendPreview = {
  /** Resolution used for the signature block, same as outbound composition. */
  selection: SenderSignatureSelection;
  /** When non-empty, the signature text the send pipeline would use. */
  signatureTextUsed: string | null;
  /**
   * Plain text: effective signature (or a clear placeholder) plus the standard
   * unsubscribe line appended **after** the block. Same function as live sends
   * (`ensureUnsubscribeLinkInPlainTextBody`); only the URL is a sample here.
   */
  bodyPlain: string;
  sampleUnsubscribeUrl: typeof MAILBOX_SIGNATURE_PREVIEW_UNSUBSCRIBE_URL;
  isPreview: true;
  /**
   * Explains to operators that the footer is order-only; does not create tokens.
   */
  footnote: string;
};

const PLACEHOLDER_NO_SIG =
  "No per-mailbox signature is available for this address yet. Set one in ODoutreach, sync from Gmail (Google) where supported, or configure a client-level brief so sends can still include a compliant footer when allowed.";

/**
 * Pure, no-send, no-IO: build the final plain-text “signature + unsubscribe
 * footer” block exactly as the compliance layer would, using a **sample**
 * unsubscribe link so nothing secret is required or written.
 */
export function buildMailboxSignatureSendPreview(input: {
  mailbox: SenderSignatureMailbox;
  clientBrief: SenderSignatureClientBriefFallback;
}): MailboxSignatureSendPreview {
  const selection = chooseSignatureForSend(input);
  const text = selection.emailSignatureText?.trim() ?? "";
  const base = text.length > 0 ? text : PLACEHOLDER_NO_SIG;
  const withFooter = ensureUnsubscribeLinkInPlainTextBody(
    base,
    MAILBOX_SIGNATURE_PREVIEW_UNSUBSCRIBE_URL,
  );

  return {
    selection,
    signatureTextUsed: text.length > 0 ? text : null,
    bodyPlain: withFooter,
    sampleUnsubscribeUrl: MAILBOX_SIGNATURE_PREVIEW_UNSUBSCRIBE_URL,
    isPreview: true,
    footnote:
      "This preview does not send email, create tokens, or change data. " +
      "In production, the line after your signature includes a real unsubscribe link per message (unique URL, not the sample above). " +
      "The unsubscribe line is always added after the signature in the same way shown here.",
  };
}
