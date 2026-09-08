/** Persist provenance: an attributed system actor is not a human send request. */
export const AUTOMATED_SEQUENCE_SEND_ORIGIN = "AUTOMATED_SEQUENCE";

export function isAutomatedSequenceSend(metadata: unknown): boolean {
  return !!metadata && typeof metadata === "object" && !Array.isArray(metadata)
    && (metadata as Record<string, unknown>).sendOrigin === AUTOMATED_SEQUENCE_SEND_ORIGIN;
}

export const AUTOMATED_SEND_HELD_MESSAGE = "Automatic sending is off or not configured for this client. This email is held for review; no email was sent.";

export function automaticSequenceHoldReason(client: { autonomousSendEnabled: boolean | null; serviceTier?: string | null }): string | null {
  if (client.serviceTier === "STRATEGIC") return "Strategic clients require human review of automatic follow-ups. Review this held email in Email approvals; no email was sent.";
  return client.autonomousSendEnabled === true ? null : AUTOMATED_SEND_HELD_MESSAGE;
}
