/** Operator must type this exactly (case-sensitive) to queue a limited first batch. */
export const CONTROLLED_PILOT_CONFIRMATION_PHRASE = "CONFIRM LIMITED BATCH";

/** Default max recipients shown in UI (operator can request up to hard max). */
export const CONTROLLED_PILOT_DEFAULT_MAX_RECIPIENTS = 5;

/** Hard safety ceiling for this slice — enforced server-side. */
export const CONTROLLED_PILOT_HARD_MAX_RECIPIENTS = 10;

/**
 * Per-batch cap for normal live sequence introduction/follow-up sends.
 * Separate from the controlled-pilot cap so raising it does not weaken
 * pilot safety limits.
 */
export const SEQUENCE_INTRODUCTION_BATCH_CAP = 30;

/** Stored on OutboundEmail.metadata.kind for ledger / Activity joins. */
export const CONTROLLED_PILOT_METADATA_KIND = "controlledPilotSend";
