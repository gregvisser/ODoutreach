/**
 * The three-tier client account grade.
 *
 * CORPORATE (VIP) / MID / STANDARD. The grade is a COMMERCIAL judgement made by
 * a member of staff, and it is the input to safety behaviour — a corporate
 * client's outreach is exposed to staff four at a time rather than all at once
 * (see `@/lib/outreach/manual-send-window`).
 *
 * Pure. No Prisma, no clock, no environment. The grade arrives as a value and
 * leaves as a decision, so every caller and every test reaches the same answer
 * from the same input.
 *
 * ## Why an unset grade is STANDARD and not CORPORATE
 *
 * This is the one place in this module where fail-closed reasoning inverts, and
 * it is deliberate. The corporate grade only ever SLOWS sending down. Treating
 * an unknown client as CORPORATE would therefore be the "safe" reading — but it
 * would also silently throttle every existing client the moment this ships,
 * which is a change to live behaviour nobody asked for and nobody would see
 * coming. An unset grade means "nobody has made this call yet", and the honest
 * default for that is the behaviour the client already has today.
 */

/** The three tiers, in descending order of handling care. */
export const CLIENT_ACCOUNT_GRADES = ["CORPORATE", "MID", "STANDARD"] as const;

export type ClientAccountGrade = (typeof CLIENT_ACCOUNT_GRADES)[number];

/**
 * What staff see. Never render the raw enum — a screen that says "CORPORATE"
 * in shouting caps is a dev-ism, and this repository has a standing rule
 * against leaking raw enum values into staff-facing UI.
 */
const GRADE_LABELS: Record<ClientAccountGrade, string> = {
  CORPORATE: "Corporate (VIP)",
  MID: "Mid",
  STANDARD: "Standard",
};

/** One line explaining what choosing this grade actually DOES. */
const GRADE_DESCRIPTIONS: Record<ClientAccountGrade, string> = {
  CORPORATE:
    "Outreach is released to staff four recipients at a time, with a 45-minute wait " +
    "between groups. The safest handling — use it for clients whose domain reputation " +
    "matters most.",
  MID: "Standard handling. No extra release limit on the send screen.",
  STANDARD: "Standard handling. No extra release limit on the send screen.",
};

export function clientAccountGradeLabel(grade: ClientAccountGrade | null | undefined): string {
  if (!grade) return "Not set";
  return GRADE_LABELS[grade];
}

export function clientAccountGradeDescription(
  grade: ClientAccountGrade | null | undefined,
): string {
  if (!grade) {
    return "Nobody has graded this account yet, so it is handled as Standard.";
  }
  return GRADE_DESCRIPTIONS[grade];
}

/** Narrow an untrusted string (form post, query result) to a grade. */
export function parseClientAccountGrade(
  value: string | null | undefined,
): ClientAccountGrade | null {
  if (typeof value !== "string") return null;
  const upper = value.trim().toUpperCase();
  return (CLIENT_ACCOUNT_GRADES as readonly string[]).includes(upper)
    ? (upper as ClientAccountGrade)
    : null;
}

/**
 * The single question the send screen asks. Kept as a named function rather
 * than an inline `=== "CORPORATE"` so that when a fourth tier arrives, there is
 * exactly one place that decides what "handled like a corporate account" means.
 */
export function isCorporateGrade(grade: ClientAccountGrade | null | undefined): boolean {
  return grade === "CORPORATE";
}

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function pad2(n: number): string {
  return n < 10 ? `0${String(n)}` : String(n);
}

/**
 * "28 Aug 14:02", built from UTC parts.
 *
 * Deliberately NOT `toLocaleString`. This string is rendered by a server
 * component and then hydrated on the client; if the two sides sit in different
 * time zones the markup differs and React throws a hydration mismatch. This
 * repository has already shipped that exact bug once on a sync timestamp. UTC
 * parts are the same number everywhere, so both sides agree.
 */
export function formatAttributionTimestamp(when: Date): string {
  const day = when.getUTCDate();
  const month = MONTHS_SHORT[when.getUTCMonth()];
  return `${String(day)} ${month} ${pad2(when.getUTCHours())}:${pad2(when.getUTCMinutes())}`;
}

/**
 * The signature line the account card shows next to the grade control.
 *
 * Returns null when nobody has graded the account — the card says so in its own
 * words rather than rendering a half-empty "Set by —, —".
 */
export function formatAccountGradeAttribution(input: {
  grade: ClientAccountGrade | null | undefined;
  setByName: string | null | undefined;
  setAt: Date | null | undefined;
}): string | null {
  if (!input.grade || !input.setAt) return null;
  // A grade whose staff user has since been deleted keeps its timestamp — the
  // FK is ON DELETE SET NULL — so say "someone" rather than dropping the line
  // entirely. Losing the fact that it WAS set is worse than losing the name.
  const who = input.setByName?.trim() ? input.setByName.trim() : "a former member of staff";
  return `Set to ${clientAccountGradeLabel(input.grade)} by ${who}, ${formatAttributionTimestamp(input.setAt)}`;
}
