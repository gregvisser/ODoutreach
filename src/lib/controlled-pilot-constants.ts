/** Operator must type this exactly (case-sensitive) to queue a controlled pilot batch. */
export const CONTROLLED_PILOT_CONFIRMATION_PHRASE = "SEND PILOT";

/** Default max recipients shown in UI (operator can request up to hard max). */
export const CONTROLLED_PILOT_DEFAULT_MAX_RECIPIENTS = 5;

/** Hard safety ceiling for this slice — enforced server-side. */
export const CONTROLLED_PILOT_HARD_MAX_RECIPIENTS = 10;

/** Stored on OutboundEmail.metadata.kind for ledger / Activity joins. */
export const CONTROLLED_PILOT_METADATA_KIND = "controlledPilotSend";
