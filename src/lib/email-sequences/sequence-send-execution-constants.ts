/**
 * PR D4e.2 — shared constants for the introduction-step dispatcher.
 *
 * Kept deliberately tiny so the pure policy + server helper + UI can
 * import the same source of truth without pulling in "server-only"
 * deps from a plain browser bundle.
 */

/** Operator must type this exactly (case-sensitive) to dispatch intro sends. */
export const SEQUENCE_INTRO_SEND_CONFIRMATION_PHRASE = "SEND INTRODUCTION";

/** Stored on OutboundEmail.metadata.kind for ledger / Activity joins. */
export const SEQUENCE_INTRO_SEND_METADATA_KIND = "sequenceIntroductionSend";

/**
 * Prefix used for every `MailboxSendReservation.idempotencyKey` minted
 * by the sequence introduction dispatcher. Distinct from the governed
 * test / controlled pilot keyspaces so duplicate ledger protection
 * cannot collide across flows.
 */
export const SEQUENCE_INTRO_RESERVATION_KEY_PREFIX = "seqIntro";

/**
 * Normalises raw operator input (from a `<form>` field or untyped API
 * caller) to a string with leading/trailing whitespace stripped.
 *
 * Hotfix after D4e.2: operators typing ` SEND INTRODUCTION` or
 * `SEND INTRODUCTION ` (trailing space or newline from a text input)
 * were being rejected even though the semantic text was correct.
 * Mirrors the trim-before-compare pattern already used by the
 * controlled pilot confirmation flow.
 *
 * Non-string inputs (undefined, null, numbers) normalise to "" so
 * downstream equality checks fail closed rather than throwing.
 */
export function normaliseSequenceIntroConfirmation(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.trim();
}

/**
 * Returns true only when the normalised operator input exactly matches
 * `SEQUENCE_INTRO_SEND_CONFIRMATION_PHRASE`. Comparison remains
 * case-sensitive by design — we only relax whitespace, not the phrase
 * itself.
 */
export function isSequenceIntroConfirmationAccepted(input: unknown): boolean {
  return (
    normaliseSequenceIntroConfirmation(input) ===
    SEQUENCE_INTRO_SEND_CONFIRMATION_PHRASE
  );
}
