/** Persist provenance: an attributed system actor is not a human send request. */
export const AUTOMATED_SEQUENCE_SEND_ORIGIN = "AUTOMATED_SEQUENCE";

export function isAutomatedSequenceSend(metadata: unknown): boolean {
  return !!metadata && typeof metadata === "object" && !Array.isArray(metadata)
    && (metadata as Record<string, unknown>).sendOrigin === AUTOMATED_SEQUENCE_SEND_ORIGIN;
}

export const AUTOMATED_SEND_HELD_MESSAGE = "Automatic sending is off or not configured for this client. This email is held for review; no email was sent.";
