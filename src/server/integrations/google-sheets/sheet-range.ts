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

/**
 * The range to read when the operator saved none.
 *
 * The FIRST tab, because that is where a sheet's main list lives and because
 * it is a fact about the sheet rather than a guess about its naming. An
 * operator whose list is on a later tab overrides it with an explicit range;
 * everyone else stops needing to know the field exists.
 *
 * An empty `tabTitles` means the lookup failed, not that the sheet has no
 * tabs — fall back to the historic default so a transient metadata error
 * leaves behaviour exactly as it was rather than inventing a range.
 */
export function resolveDefaultSheetRange(tabTitles: readonly string[]): string {
  const first = tabTitles.map((t) => t.trim()).find((t) => t.length > 0);
  return first ? wholeTabRange(first) : DEFAULT_SHEET_RANGE;
}
