import "server-only";

import type { ClientMailboxIdentity } from "@/generated/prisma/client";
import { chooseSignatureForSend } from "@/lib/mailboxes/sender-signature";
import { resolvePublicBaseUrl } from "@/lib/unsubscribe/one-click-readiness";
import {
  complianceMetadata,
  prepareContactSendCompliance,
  type ContactSendComplianceResult,
} from "@/lib/unsubscribe/contact-send-compliance";

export function appendMailboxSignature(input: {
  bodyText: string;
  mailbox: ClientMailboxIdentity;
}): string | null {
  const selection = chooseSignatureForSend({
    mailbox: input.mailbox,
    clientBrief: {
      senderDisplayNameFallback: null,
      emailSignatureFallback: null,
    },
  });
  const signature = selection.emailSignatureText?.trim();
  if (!signature) return null;
  return `${input.bodyText.replace(/\s+$/u, "")}\n\n${signature}`;
}

/**
 * Compliance for the governed-test and controlled-pilot send paths. Both only
 * ever reach an ALLOWLISTED recipient, so the OpensDoors app domain is the
 * documented carve-out for the hosted unsubscribe link. Real-prospect sends do
 * NOT come through here — see `sendEmailToContact`, which resolves the client's
 * own aligned link domain or falls back to mailto.
 */
export function prepareMailboxSendCompliance(input: {
  bodyText: string;
  mailbox: ClientMailboxIdentity;
  clientDefaultSenderEmail: string | null;
}): ContactSendComplianceResult | null {
  const withSignature = appendMailboxSignature({
    bodyText: input.bodyText,
    mailbox: input.mailbox,
  });
  if (!withSignature) return null;
  return prepareContactSendCompliance({
    bodyText: withSignature,
    clientDefaultSenderEmail: input.clientDefaultSenderEmail ?? input.mailbox.email,
    hostedBaseUrl: resolvePublicBaseUrl(),
  });
}

export function mailboxComplianceMetadata(c: ContactSendComplianceResult):
  | { headers: { listUnsubscribe: string; listUnsubscribePost: string } }
  | undefined {
  return complianceMetadata(c);
}
