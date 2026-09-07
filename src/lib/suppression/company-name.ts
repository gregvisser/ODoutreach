/** Version decisions with this value; changed matching rules require a new review. */
export const COMPANY_NAME_MATCH_VERSION = 1;
export const MAX_COMPANY_NAME_LENGTH = 300;

/**
 * Only spelling/formatting and terminal legal forms are equivalent. Keep words
 * such as Group, Council, UK and trading-as names: they can identify a different
 * organisation. Never infer a parent/subsidiary relationship from the name.
 */
export function canonicalCompanyName(raw: string): string {
  let name = raw.normalize("NFKC").toLowerCase()
    .replace(/&/gu, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const legalSuffix = /(?:^| )(?:limited liability company|public limited company|l l c|p l c|l t d|i n c|limited|ltd|plc|llc|incorporated|inc|corporation)$/u;
  while (legalSuffix.test(name)) name = name.replace(legalSuffix, "").trim();
  return name;
}

export type CompanyNameEntry = { id: string; originalName: string; canonicalName: string };
export type CompanyNameDecision = {
  outcome: "CLEAR" | "BLOCK" | "REVIEW";
  reason: "no_list" | "no_match" | "exact_name" | "similar_name" | "missing_company";
  canonicalName: string;
  matchedEntryIds: string[];
};

function closeSpelling(a: string, b: string, limit: number): boolean {
  if (Math.abs(a.length - b.length) > limit) return false;
  // Bounded edit-distance band, including adjacent transpositions. Work grows
  // with name length rather than the square of it for a large imported list.
  let previous = new Map<number, number>();
  let beforePrevious = previous;
  for (let j = 0; j <= Math.min(b.length, limit); j++) previous.set(j, j);
  for (let i = 1; i <= a.length; i++) {
    const current = new Map<number, number>();
    if (i <= limit) current.set(0, i);
    for (let j = Math.max(1, i - limit); j <= Math.min(b.length, i + limit); j++) {
      let distance = Math.min(
        (previous.get(j) ?? Infinity) + 1,
        (current.get(j - 1) ?? Infinity) + 1,
        (previous.get(j - 1) ?? Infinity) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        distance = Math.min(distance, (beforePrevious.get(j - 2) ?? Infinity) + 1);
      }
      current.set(j, distance);
    }
    beforePrevious = previous;
    previous = current;
  }
  return (previous.get(b.length) ?? Infinity) <= limit;
}

function needsNameReview(a: string, b: string): boolean {
  // Compact spelling and token order are review candidates, never identities.
  const compactA = a.replace(/ /g, ""), compactB = b.replace(/ /g, "");
  if (compactA === compactB) return true;
  const minLength = Math.min(compactA.length, compactB.length);
  if (minLength >= 5 && closeSpelling(compactA, compactB, minLength >= 8 ? 2 : 1)) return true;
  const wordsA = a.split(" "), wordsB = b.split(" ");
  const shorter = wordsA.length <= wordsB.length ? wordsA : wordsB;
  const longer = wordsA.length <= wordsB.length ? wordsB : wordsA;
  // A whole meaningful name included in a longer name needs a person to decide.
  return shorter.some(word => word.length >= 3 && word !== "and") &&
    shorter.every(word => longer.includes(word));
}

/** Caller supplies entries from ONE client; this function performs no IO. */
export function matchCompanyName(raw: string | null | undefined, entries: readonly CompanyNameEntry[]): CompanyNameDecision {
  const canonicalName = canonicalCompanyName(raw ?? "");
  const result = (outcome: CompanyNameDecision["outcome"], reason: CompanyNameDecision["reason"], matches: readonly CompanyNameEntry[] = []): CompanyNameDecision =>
    ({ outcome, reason, canonicalName, matchedEntryIds: matches.map(entry => entry.id).sort() });
  if (entries.length === 0) return result("CLEAR", "no_list");
  if (!canonicalName) return result("REVIEW", "missing_company");
  const exact = entries.filter(entry => entry.canonicalName === canonicalName);
  if (exact.length) return result("BLOCK", "exact_name", exact);
  const similar = entries.filter(entry => entry.canonicalName && needsNameReview(canonicalName, entry.canonicalName));
  return similar.length ? result("REVIEW", "similar_name", similar) : result("CLEAR", "no_match");
}
