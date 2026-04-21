/**
 * PR D4e.2 — shared constants for the introduction-step dispatcher.
 * PR D4e.3 — extended for per-category (INTRODUCTION + FOLLOW_UP_1..5)
 * operator-triggered sends.
 *
 * Kept deliberately tiny so the pure policy + server helper + UI can
 * import the same source of truth without pulling in "server-only"
 * deps from a plain browser bundle.
 */

import type { ClientEmailTemplateCategory } from "@/generated/prisma/enums";

// ---------------------------------------------------------------------------
// Confirmation phrases — one per category.
// ---------------------------------------------------------------------------

/** Operator must type this exactly (case-sensitive) to dispatch intro sends. */
export const SEQUENCE_INTRO_SEND_CONFIRMATION_PHRASE = "SEND INTRODUCTION";

/**
 * Full map of per-category confirmation phrases. Note follow-up phrases
 * use a single space between `FOLLOW` and `UP` (not an underscore) so
 * they match natural operator typing. Internal whitespace is part of
 * the phrase and is NOT collapsed during comparison.
 */
export const SEQUENCE_STEP_SEND_CONFIRMATION_PHRASES: Readonly<
  Record<ClientEmailTemplateCategory, string>
> = Object.freeze({
  INTRODUCTION: SEQUENCE_INTRO_SEND_CONFIRMATION_PHRASE,
  FOLLOW_UP_1: "SEND FOLLOW UP 1",
  FOLLOW_UP_2: "SEND FOLLOW UP 2",
  FOLLOW_UP_3: "SEND FOLLOW UP 3",
  FOLLOW_UP_4: "SEND FOLLOW UP 4",
  FOLLOW_UP_5: "SEND FOLLOW UP 5",
});

export function getSequenceStepSendConfirmationPhrase(
  category: ClientEmailTemplateCategory,
): string {
  return SEQUENCE_STEP_SEND_CONFIRMATION_PHRASES[category];
}

// ---------------------------------------------------------------------------
// Metadata / reservation keys stored on OutboundEmail + reservations.
// ---------------------------------------------------------------------------

/** Stored on OutboundEmail.metadata.kind for sequence introduction sends. */
export const SEQUENCE_INTRO_SEND_METADATA_KIND = "sequenceIntroductionSend";

/** Stored on OutboundEmail.metadata.kind for sequence follow-up sends. */
export const SEQUENCE_FOLLOWUP_SEND_METADATA_KIND = "sequenceFollowUpSend";

export function getSequenceStepSendMetadataKind(
  category: ClientEmailTemplateCategory,
): string {
  return category === "INTRODUCTION"
    ? SEQUENCE_INTRO_SEND_METADATA_KIND
    : SEQUENCE_FOLLOWUP_SEND_METADATA_KIND;
}

/** Every sequence-send metadata kind the Activity timeline recognises. */
export const SEQUENCE_STEP_SEND_METADATA_KINDS: readonly string[] = [
  SEQUENCE_INTRO_SEND_METADATA_KIND,
  SEQUENCE_FOLLOWUP_SEND_METADATA_KIND,
];

/**
 * Prefix used for every `MailboxSendReservation.idempotencyKey` minted
 * by the INTRODUCTION dispatcher. Distinct from the governed test /
 * controlled pilot keyspaces so duplicate ledger protection cannot
 * collide across flows. Kept as its own constant for back-compat with
 * D4e.2 reservation rows already in production.
 */
export const SEQUENCE_INTRO_RESERVATION_KEY_PREFIX = "seqIntro";

/**
 * Per-category reservation-key prefix. INTRODUCTION keeps the legacy
 * `seqIntro` value so D4e.2 ledger rows remain unambiguous; follow-ups
 * get a `seqFollow${N}` prefix so their reservation keys are trivially
 * distinguishable in the reservation ledger.
 */
export function getSequenceStepSendReservationPrefix(
  category: ClientEmailTemplateCategory,
): string {
  switch (category) {
    case "INTRODUCTION":
      return SEQUENCE_INTRO_RESERVATION_KEY_PREFIX;
    case "FOLLOW_UP_1":
      return "seqFollow1";
    case "FOLLOW_UP_2":
      return "seqFollow2";
    case "FOLLOW_UP_3":
      return "seqFollow3";
    case "FOLLOW_UP_4":
      return "seqFollow4";
    case "FOLLOW_UP_5":
      return "seqFollow5";
  }
}

// ---------------------------------------------------------------------------
// Confirmation normalisation / comparison — whitespace-tolerant, case
// -sensitive, preserves internal whitespace.
// ---------------------------------------------------------------------------

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
 * PR D4e.3: extended to follow-up confirmation phrases. Internal
 * whitespace is NEVER collapsed — `SEND  FOLLOW UP 1` (two spaces)
 * remains distinct from `SEND FOLLOW UP 1`.
 *
 * Non-string inputs (undefined, null, numbers) normalise to "" so
 * downstream equality checks fail closed rather than throwing.
 */
export function normaliseSequenceStepSendConfirmation(
  input: unknown,
): string {
  if (typeof input !== "string") return "";
  return input.trim();
}

/**
 * Returns true only when the normalised operator input exactly matches
 * the confirmation phrase for the given category. Comparison remains
 * case-sensitive by design — we only relax surrounding whitespace, not
 * the phrase itself.
 */
export function isSequenceStepSendConfirmationAccepted(
  category: ClientEmailTemplateCategory,
  input: unknown,
): boolean {
  return (
    normaliseSequenceStepSendConfirmation(input) ===
    getSequenceStepSendConfirmationPhrase(category)
  );
}

// ---------------------------------------------------------------------------
// Back-compat aliases for D4e.2 call sites that only knew about intro.
// ---------------------------------------------------------------------------

/** @deprecated use `normaliseSequenceStepSendConfirmation`. */
export function normaliseSequenceIntroConfirmation(input: unknown): string {
  return normaliseSequenceStepSendConfirmation(input);
}

/** @deprecated use `isSequenceStepSendConfirmationAccepted`. */
export function isSequenceIntroConfirmationAccepted(input: unknown): boolean {
  return isSequenceStepSendConfirmationAccepted("INTRODUCTION", input);
}
