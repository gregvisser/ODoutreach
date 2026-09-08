import { TZDate } from "@date-fns/tz";

/** One local working interval per selected day. Overnight intervals are not supported. */
export type SendingCalendar = {
  timeZone: string;
  /** JavaScript weekday numbering: Sunday=0, Monday=1, Saturday=6. */
  weekdays: number[];
  startMinute: number;
  /** Exclusive. 1440 means the next local midnight. */
  endMinute: number;
};

export type CalendarWindow = { startsAt: Date; endsAt: Date };
export type SendingCalendarDay = CalendarWindow & {
  localDate: string;
  timeZone: string;
  windows: CalendarWindow[];
};

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const MINUTE_MS = 60_000;

/** Stored JSON and form values must be validated before they can permit a send. */
export function parseSendingCalendar(value: unknown): Result<SendingCalendar> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Choose a sending timezone, working days and hours." };
  }
  const row = value as Record<string, unknown>;
  if (typeof row.timeZone !== "string" || row.timeZone.length > 100 || !row.timeZone.trim()) {
    return { ok: false, error: "Choose a valid timezone." };
  }
  let timeZone: string;
  try {
    // Require a named zone, not a fixed offset that loses daylight-saving rules.
    if (/^[+-]/.test(row.timeZone)) throw Error("Fixed offset");
    timeZone = new Intl.DateTimeFormat("en", { timeZone: row.timeZone }).resolvedOptions().timeZone;
  } catch {
    return { ok: false, error: "Choose a valid named timezone, such as Europe/London." };
  }
  if (!Array.isArray(row.weekdays) || !row.weekdays.length || row.weekdays.length > 7 ||
      row.weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6) ||
      new Set(row.weekdays).size !== row.weekdays.length) {
    return { ok: false, error: "Choose at least one working day, with no duplicates." };
  }
  if (typeof row.startMinute !== "number" || typeof row.endMinute !== "number" ||
      !Number.isInteger(row.startMinute) || !Number.isInteger(row.endMinute) ||
      row.startMinute < 0 || row.endMinute > 1440 || row.startMinute >= row.endMinute) {
    return { ok: false, error: "Choose an end time after the start time on the same day." };
  }
  return { ok: true, value: { timeZone, weekdays: [...row.weekdays].sort((a, b) => a - b), startMinute: row.startMinute, endMinute: row.endMinute } };
}

// Cache numbers, not mutable Dates. Many mailboxes share a client's calendar.
// Bound the cache so arbitrary valid calendars cannot grow a worker indefinitely.
type CachedDay = { start: number; end: number; intervals: [number, number][] };
const dayCache = new Map<string, CachedDay>();
const MAX_CACHED_DAYS = 128;

/**
 * Resolve actual instants belonging to a local day and its working hours.
 * The library supplies local midnight boundaries (including 23/25-hour days).
 * Scan real minutes, rather than converting an ambiguous clock time once:
 * missing spring minutes never exist; repeated autumn minutes both exist and
 * remain subject to the SAME daily allowance. Closing time is exclusive.
 *
 * This clock resolver alone does not enforce quotas or authorise dispatch.
 */
export function resolveSendingCalendarDay(value: unknown, at: Date): Result<SendingCalendarDay> {
  const parsed = parseSendingCalendar(value);
  if (!parsed.ok) return parsed;
  if (!Number.isFinite(at.getTime())) return { ok: false, error: "Cannot resolve an invalid sending date." };
  const calendar = parsed.value;
  const local = new TZDate(at, calendar.timeZone);
  const year = local.getFullYear();
  const month = local.getMonth();
  const date = local.getDate();
  const localDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
  const key = JSON.stringify([calendar, localDate]);
  let cached = dayCache.get(key);
  if (!cached) {
    const start = +new TZDate(year, month, date, 0, 0, 0, calendar.timeZone);
    const end = +new TZDate(year, month, date + 1, 0, 0, 0, calendar.timeZone);
    // Fail closed for unrepresentable boundaries, rather than making a UTC day
    // up. The bound also makes iteration finite for unusual historical zones.
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > +at || end <= +at ||
        end <= start || end - start > 48 * 60 * MINUTE_MS) {
      return { ok: false, error: "Cannot safely resolve this timezone's day boundaries." };
    }
    const intervals: [number, number][] = [];
    if (calendar.weekdays.includes(local.getDay())) {
      for (let instant = start; instant < end; instant += MINUTE_MS) {
        const wall = new TZDate(instant, calendar.timeZone);
        const minute = wall.getHours() * 60 + wall.getMinutes();
        if (wall.getFullYear() !== year || wall.getMonth() !== month || wall.getDate() !== date ||
            minute < calendar.startMinute || minute >= calendar.endMinute) continue;
        const until = Math.min(instant + MINUTE_MS, end);
        const prior = intervals.at(-1);
        if (prior && prior[1] === instant) prior[1] = until;
        else intervals.push([instant, until]);
      }
    }
    cached = { start, end, intervals };
    dayCache.set(key, cached);
    if (dayCache.size > MAX_CACHED_DAYS) dayCache.delete(dayCache.keys().next().value!);
  }
  return { ok: true, value: {
    localDate, timeZone: calendar.timeZone,
    startsAt: new Date(cached.start), endsAt: new Date(cached.end),
    windows: cached.intervals.map(([start, end]) => ({ startsAt: new Date(start), endsAt: new Date(end) })),
  } };
}

/** Current allowed interval, or the next one. Null means no safe interval was found. */
export function nextSendingCalendarWindow(value: unknown, at: Date): Result<CalendarWindow | null> {
  let cursor = at;
  // Two weeks cover a selected weekday whose whole interval disappears during
  // a spring clock change. Advance by local day boundaries, never fixed 24h.
  for (let day = 0; day < 15; day++) {
    const resolved = resolveSendingCalendarDay(value, cursor);
    if (!resolved.ok) return resolved;
    const window = resolved.value.windows.find(candidate => +candidate.endsAt > +at);
    if (window) return { ok: true, value: window };
    cursor = resolved.value.endsAt;
  }
  return { ok: true, value: null };
}

/**
 * A timezone change must not introduce a short extra allowance day. Finish the
 * current accounting day, then pause until a full day in the new zone begins.
 * The caller must persist these boundaries and enforce the pause under the
 * same lock used by reservations/dispatch. This helper alone changes nothing.
 * Null current means the existing UTC accounting calendar, not inferred hours.
 */
export function planSendingCalendarChange(current: unknown, next: unknown, at: Date): Result<{
  pauseStartsAt: Date;
  effectiveAt: Date;
}> {
  const currentDay = resolveSendingCalendarDay(current ?? {
    timeZone: "UTC", weekdays: [0, 1, 2, 3, 4, 5, 6], startMinute: 0, endMinute: 1440,
  }, at);
  if (!currentDay.ok) return currentDay;
  const pauseStartsAt = currentDay.value.endsAt;
  const nextDay = resolveSendingCalendarDay(next, pauseStartsAt);
  if (!nextDay.ok) return nextDay;
  const effectiveAt = +nextDay.value.startsAt === +pauseStartsAt ? pauseStartsAt : nextDay.value.endsAt;
  return { ok: true, value: { pauseStartsAt: new Date(+pauseStartsAt), effectiveAt: new Date(+effectiveAt) } };
}
