import "server-only";

import type { ClientMailboxIdentity } from "@/generated/prisma/client";
import { chooseSignatureForSend } from "@/lib/mailboxes/sender-signature";
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
  });
}

export function mailboxComplianceMetadata(c: ContactSendComplianceResult):
  | { headers: { listUnsubscribe: string; listUnsubscribePost: string } }
  | undefined {
  return complianceMetadata(c);
}
