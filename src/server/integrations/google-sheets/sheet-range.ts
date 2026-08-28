/**
 * A1-notation ranges for reading a whole tab.
 *
 * The product used to assume every client's Sheet had a tab called "Sheet1".
 * Two live do-not-contact sheets did not, so both were read as a range that
 * does not exist — one client had no domain protection at all, the other was
 * served stale rows for weeks. The tab names were always available from
 * `spreadsheets.get`; nothing was ever done with them.
 */

/** The historic guess. Still the last resort when the tab names cannot be read. */
export const DEFAULT_SHEET_RANGE = "Sheet1!A1:Z50000";

/** Matches the column/row span of the historic default, so nothing narrows. */
const WHOLE_TAB_SPAN = "A1:Z50000";

/**
 * Quote a tab title for A1 notation.
 *
 * Always quoted rather than only-when-needed: "Company Names" and "2026 DNC"
 * both break an unquoted range, and the rules for which characters force
 * quoting are more surface than this needs. Google accepts quotes around a
 * plain name, so quoting unconditionally has no failure mode. Internal single
 * quotes are doubled, which is how A1 escapes them.
 */
export function quoteSheetTitle(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

/**
 * The range that reads the whole of a named tab.
 */
export function wholeTabRange(title: string): string {
  return `${quoteSheetTitle(title)}!${WHOLE_TAB_SPAN}`;
}

/** The tab the product used to assume, matched exactly rather than by prefix. */
const HISTORIC_TAB = "Sheet1";

/**
 * The range to read when the operator saved none.
 *
 * An existing "Sheet1" wins, and otherwise the FIRST tab.
 *
 * The first tab is the right general answer — it is where a sheet's main list
 * lives, and it is a fact about the sheet rather than a guess about its
 * naming. But this function decides the range for every source with no saved
 * range, which on 2026-08-28 was all 34 of them, and 32 were syncing perfectly
 * well. Those 32 work precisely because their sheet does have a "Sheet1". If
 * any one of them keeps "Sheet1" in second place, "read the first tab" would
 * silently repoint a healthy live blocklist at a different tab — and
 * `decideSuppressionReplace` refuses a shrink or a zero, not a substitution of
 * roughly equal size. The fix for two broken clients would have become a
 * quiet risk to thirty-two working ones.
 *
 * Preferring an existing "Sheet1" removes that entirely: every list that reads
 * correctly today reads the identical tab tomorrow, and only sheets that never
 * had a "Sheet1" — which is exactly the two that were broken — change at all.
 *
 * An operator whose list is on neither overrides it with an explicit range.
 *
 * An empty `tabTitles` means the lookup failed, not that the sheet has no
 * tabs — fall back to the historic default so a transient metadata error
 * leaves behaviour exactly as it was rather than inventing a range.
 */
export function resolveDefaultSheetRange(tabTitles: readonly string[]): string {
  const titles = tabTitles.map((t) => t.trim()).filter((t) => t.length > 0);
  const historic = titles.find((t) => t === HISTORIC_TAB);
  const chosen = historic ?? titles[0];
  return chosen ? wholeTabRange(chosen) : DEFAULT_SHEET_RANGE;
}
