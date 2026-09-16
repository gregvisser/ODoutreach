import "server-only";

export type DisplayWindow = { gte: Date; lt: Date };

/** Read-side history boundary. Unset preserves the legacy all-history view. */
export function getDisplayDataCutoffAt(): Date | null {
  const raw = process.env.DISPLAY_DATA_CUTOFF_AT;
  if (raw === undefined || raw.trim() === "") return null;
  const date = new Date(raw);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(raw) ||
      !Number.isFinite(date.getTime()) || date.toISOString() !== raw.replace(/Z$/, raw.includes(".") ? "Z" : ".000Z")) {
    throw new Error("DISPLAY_DATA_CUTOFF_AT must be a valid ISO date");
  }
  return date;
}

/** Intersect an optional report window with the configured lower bound. */
export function intersectDisplayWindow(window?: DisplayWindow): DisplayWindow | undefined {
  const cutoff = getDisplayDataCutoffAt();
  if (!cutoff) return window;
  if (!window) return { gte: cutoff, lt: new Date("9999-12-31T23:59:59.999Z") };
  return { gte: window.gte > cutoff ? window.gte : cutoff, lt: window.lt };
}

export function displayCutoffDateFilter(): { gte: Date } | undefined {
  const cutoff = getDisplayDataCutoffAt();
  return cutoff ? { gte: cutoff } : undefined;
}

/** Make the reporting boundary visible without exposing operational history. */
export function displayHistoryLabel(): string {
  const cutoff = getDisplayDataCutoffAt();
  if (!cutoff) return "All-time";
  return `Since ${new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(cutoff)} (UK time)`;
}
