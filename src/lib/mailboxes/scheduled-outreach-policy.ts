/** Existing automatic hours for clients without a custom calendar (UTC). */
export const LEGACY_SCHEDULED_UTC_HOURS = { first: 7, last: 18 } as const;
export function isLegacyScheduledWindow(at: Date): boolean {
  return at.getUTCDay() >= 1 && at.getUTCDay() <= 5 && at.getUTCHours() >= LEGACY_SCHEDULED_UTC_HOURS.first && at.getUTCHours() <= LEGACY_SCHEDULED_UTC_HOURS.last;
}
