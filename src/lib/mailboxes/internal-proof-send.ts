import { normalizeEmail } from "@/lib/normalize";

export const INTERNAL_PROOF_CONFIRMATION_PHRASE = "SEND INTERNAL PROOF";

export const INTERNAL_PROOF_METADATA_KIND = "internalProofSend";

export const APPROVED_INTERNAL_PROOF_RECIPIENTS = [
  "greg.visser46@gmail.com",
  "greg.visser64@gmail.com",
  "greg.visser43@gmail.com",
  "greg@bidlow.co.uk",
  "support@bidlow.co.uk",
  "greg@opensdoors.co.uk",
] as const;

const APPROVED_INTERNAL_PROOF_RECIPIENT_SET = new Set<string>(
  APPROVED_INTERNAL_PROOF_RECIPIENTS.map((email) => normalizeEmail(email)),
);

export function isApprovedInternalProofRecipient(email: string): boolean {
  return APPROVED_INTERNAL_PROOF_RECIPIENT_SET.has(normalizeEmail(email));
}

