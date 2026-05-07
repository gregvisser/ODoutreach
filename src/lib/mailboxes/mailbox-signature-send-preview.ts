import { ensureUnsubscribeLinkInPlainTextBody } from "@/lib/unsubscribe/ensure-unsubscribe-in-body";
import { buildMailboxGovernedEmailBodies } from "@/lib/unsubscribe/outreach-mailbox-bodies";

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

const SAMPLE_INTRO =
  "Your introduction text appears here (sequence content sits above the signature).";

export type MailboxSignatureSendPreview = {
  /** Resolution used for the signature block, same as outbound composition. */
  selection: SenderSignatureSelection;
  /** When non-empty, the signature text the send pipeline would use. */
  signatureTextUsed: string | null;
  bodyPlain: string;
  bodyHtml: string;
  sampleUnsubscribeUrl: typeof MAILBOX_SIGNATURE_PREVIEW_UNSUBSCRIBE_URL;
  isPreview: true;
  footnote: string;
};

const PLACEHOLDER_NO_SIG =
  "No mailbox signature configured. Add the full branded signature/disclaimer before live outreach.";

/**
 * Pure, no-send, no-IO: mirrors governed mailbox HTML/plain assembly using a sample intro line.
 */
export function buildMailboxSignatureSendPreview(input: {
  mailbox: SenderSignatureMailbox;
  clientBrief: SenderSignatureClientBriefFallback;
}): MailboxSignatureSendPreview {
  const selection = chooseSignatureForSend(input);
  const text = selection.emailSignatureText?.trim() ?? "";
  const hasSig = text.length > 0;
  const coreBody = hasSig
    ? `${SAMPLE_INTRO}\n\n${text}`
    : `${SAMPLE_INTRO}\n\n${PLACEHOLDER_NO_SIG}`;
  const withFooter = ensureUnsubscribeLinkInPlainTextBody(
    coreBody,
    MAILBOX_SIGNATURE_PREVIEW_UNSUBSCRIBE_URL,
  );
  const bodies = buildMailboxGovernedEmailBodies({
    bodySnapshotPlain: withFooter,
    mailbox: input.mailbox,
    hostedUnsubscribeUrl: MAILBOX_SIGNATURE_PREVIEW_UNSUBSCRIBE_URL,
  });

  const baseFootnote =
    "This preview does not send email, create tokens, or change data. " +
    "The real unsubscribe URL is minted per recipient on send. " +
    "Order is always: message → full signature/disclaimer → unsubscribe.";

  return {
    selection,
    signatureTextUsed: hasSig ? text : null,
    bodyPlain: bodies.text,
    bodyHtml: bodies.html,
    sampleUnsubscribeUrl: MAILBOX_SIGNATURE_PREVIEW_UNSUBSCRIBE_URL,
    isPreview: true,
    footnote: hasSig ? baseFootnote : PLACEHOLDER_NO_SIG + " " + baseFootnote,
  };
}
