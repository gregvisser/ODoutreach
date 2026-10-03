/** Hard cap shared by manual search and manual plan runs. */
export const ROCKETREACH_MAX_IMPORT = 10;

/**
 * Automatic list top-up batch size. Each top-up pulls between the minimum and
 * the maximum, sized to what the sequence's connected mailboxes can safely send
 * over the horizon. This is a per-top-up batch, not a lifetime or monthly cap:
 * the list is topped up again whenever it runs low.
 */
export const ROCKETREACH_AUTO_TOP_UP_MIN_BATCH = 10;
export const ROCKETREACH_AUTO_TOP_UP_MAX_BATCH = 30;
/** Days of safe sending a top-up aims to cover. */
export const ROCKETREACH_AUTO_TOP_UP_HORIZON_DAYS = 3;

/** Largest page an import may ask RocketReach for. Manual paths stay at 10. */
export function rocketReachImportPageCeiling(maxBatch: number | undefined): number {
  if (maxBatch === undefined || !Number.isSafeInteger(maxBatch) || maxBatch < 1) return ROCKETREACH_MAX_IMPORT;
  return Math.min(maxBatch, ROCKETREACH_AUTO_TOP_UP_MAX_BATCH);
}
