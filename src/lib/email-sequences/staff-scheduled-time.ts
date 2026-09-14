import { TZDate } from "@date-fns/tz";

export const STAFF_SCHEDULE_TIME_ZONE = "Europe/London";

/** Interpret the labelled UK wall time independently of the browser timezone. */
export function ukScheduledTimeToIso(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number);
  const date = new TZDate(year, month - 1, day, hour, minute, 0, STAFF_SCHEDULE_TIME_ZONE);
  // Reject invalid dates and nonexistent wall times during the spring change.
  if (!Number.isFinite(+date) || date.getFullYear() !== year || date.getMonth() !== month - 1 ||
      date.getDate() !== day || date.getHours() !== hour || date.getMinutes() !== minute) return null;
  return new Date(+date).toISOString();
}

export function isValidStaffScheduledTime(iso: string, now = new Date()): boolean {
  const at = Date.parse(iso);
  return /Z$/.test(iso) && Number.isFinite(at) && at > +now && at <= +now + 30 * 24 * 60 * 60 * 1000;
}
