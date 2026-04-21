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
