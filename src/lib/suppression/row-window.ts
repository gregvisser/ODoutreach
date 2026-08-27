/**
 * The sentence printed under the blocked-contact tables on /suppression.
 *
 * It exists as its own module — rather than as JSX in the table — because the
 * defect it replaces was a sentence, not a layout. The table used to print
 * `rows.length` on both sides of the word "of", so a client with 30,229 blocked
 * addresses was described as "Showing 200 of 200": not an incomplete count, a
 * count that claimed to be complete. Pulling the wording out here makes it
 * something a test can hold to account.
 */

export type RowNoun = {
  /** e.g. "blocked email address" */
  one: string;
  /** e.g. "blocked email addresses" */
  many: string;
};

export type RowWindow = {
  /** Every row matching the current filter, as counted by the database. */
  total: number;
  /** How many of them are on this page. */
  shown: number;
  /** How many rows were skipped to reach this page. */
  offset: number;
  /** Whether a search term is currently narrowing the set. */
  searching: boolean;
  noun: RowNoun;
};

function plural(n: number, noun: RowNoun): string {
  return n === 1 ? noun.one : noun.many;
}

function n(value: number): string {
  return value.toLocaleString("en-GB");
}

export function describeRowWindow({
  total,
  shown,
  offset,
  searching,
  noun,
}: RowWindow): string {
  if (searching) {
    if (total === 0) {
      return `No ${noun.many} match your search.`;
    }
    if (shown >= total) {
      return `${n(total)} ${plural(total, noun)} ${
        total === 1 ? "matches" : "match"
      } your search.`;
    }
    const first = offset + 1;
    const last = offset + shown;
    return `Showing ${n(first)}–${n(last)} of ${n(total)} ${plural(
      total,
      noun,
    )} matching your search.`;
  }

  if (total === 0) {
    return `No ${noun.many} yet.`;
  }
  if (shown >= total) {
    return `Showing all ${n(total)} ${plural(total, noun)}.`;
  }
  const first = offset + 1;
  const last = offset + shown;
  return `Showing ${n(first)}–${n(last)} of ${n(total)} ${plural(total, noun)}.`;
}
