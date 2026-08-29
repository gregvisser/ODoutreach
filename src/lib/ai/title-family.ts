/**
 * Grouping free-text job titles into families, WITHOUT a model.
 *
 * Queue row 80 item 7 asks which message works best for which job title. The
 * obstacle is that a job title in this database is whatever a CSV or a
 * RocketReach record happened to contain: `Contact.title` is a nullable free
 * string, so "VP of Operations", "Vice President, Operations", "V.P. Ops" and
 * "Operations Vice President" are four buckets of one person each. Grouped
 * naively there is nothing to compare, and every cell is noise.
 *
 * WHY THIS IS DETERMINISTIC CODE AND NOT A MODEL CALL. The grouping decides
 * which people get pooled together, and pooling is what the significance test
 * downstream is measuring. If a model drew the buckets, the buckets would move
 * between runs, two runs on identical data could disagree about whether a
 * difference is real, and the arithmetic would be resting on a judgement nobody
 * could re-check. It would also be billed per run, for a mapping that does not
 * change. So the model is never shown a raw title — it is shown a table of
 * counts over families this file drew.
 *
 * TWO RULES DECIDE EVERY MAPPING BELOW.
 *
 * 1. FUNCTION BEATS SENIORITY. What somebody does predicts which email lands;
 *    how senior they are does not, at least not in a way one client's history
 *    can show. So "Operations Director" is Operations, not a director. Seniority
 *    is used only for titles that name NO function — an Owner or a Managing
 *    Director really is a distinct audience.
 * 2. AN UNRECOGNISED TITLE IS `null`, NEVER "Other". This is the important one.
 *    A catch-all family would be a bucket containing four unrelated jobs, and a
 *    finding about it would read as a finding about an audience that does not
 *    exist. `null` rows are counted and reported as coverage — see
 *    `title-message-evidence.ts` — so an operator can see how much of their list
 *    the answer is silent about, rather than being shown a confident number over
 *    a bucket of leftovers.
 *
 * Bare "Director" and bare "Manager" are deliberately `null` under rule 2. They
 * name no function, and unlike "Owner" they do not reliably name a
 * decision-maker either: a Sales Director and a Finance Director are both
 * "Director", and pooling them would put two audiences in one row.
 *
 * NOTHING HERE READS OR WRITES ANYTHING. It is a pure string function.
 */

/**
 * The families a title can land in.
 *
 * Kept small on purpose. Cold-outreach reply rates are low single digits, so
 * every extra family divides the same replies into thinner cells until nothing
 * clears the significance test. Ten families over a few thousand contacts is
 * about the finest split this data can actually support.
 */
export type TitleFamily =
  | "OWNER_OR_FOUNDER"
  | "FINANCE"
  | "OPERATIONS"
  | "HR_AND_PEOPLE"
  | "HEALTH_SAFETY_AND_QUALITY"
  | "IT_AND_ENGINEERING"
  | "SALES_AND_BUSINESS_DEVELOPMENT"
  | "MARKETING"
  | "PROCUREMENT"
  | "LEGAL";

/** How a family is named on screen and in the prompt. */
export const TITLE_FAMILY_LABELS: Readonly<Record<TitleFamily, string>> = {
  OWNER_OR_FOUNDER: "Owners & founders",
  FINANCE: "Finance",
  OPERATIONS: "Operations",
  HR_AND_PEOPLE: "HR & people",
  HEALTH_SAFETY_AND_QUALITY: "Health, safety & quality",
  IT_AND_ENGINEERING: "IT & engineering",
  SALES_AND_BUSINESS_DEVELOPMENT: "Sales & business development",
  MARKETING: "Marketing",
  PROCUREMENT: "Procurement",
  LEGAL: "Legal",
};

export function titleFamilyLabel(family: TitleFamily): string {
  return TITLE_FAMILY_LABELS[family];
}

/**
 * Strip a title down to lowercase words separated by single spaces, padded with
 * a space at each end.
 *
 * The padding is what makes whole-word matching a substring test: `" ops "`
 * matches "Head of Ops" and does not match "Shops Director". `&` becomes "and"
 * before punctuation is dropped so "Health & Safety" and "Health and Safety"
 * normalise identically, and everything else non-alphanumeric becomes a space
 * so "V.P., Operations" and "VP Operations" do too.
 */
export function normalizeTitle(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return cleaned ? ` ${cleaned} ` : "";
}

/**
 * The rules, IN PRIORITY ORDER. The first family with a matching term wins.
 *
 * The order is load-bearing, not cosmetic, and each position below earns itself
 * by resolving a title that two rules would otherwise both claim:
 *
 *   * Safety and quality run FIRST so "Quality Controller" is quality rather
 *     than being taken by Finance's "controller".
 *   * Operations runs before IT so "Production Engineer" is operations, and
 *     Sales runs before IT so "Sales Engineer" is sales — while "Software
 *     Engineer", claimed by neither, falls through to IT.
 *   * Owners run LAST, so any title naming a function is that function first.
 *     Only a title with no function left in it reaches "Managing Director".
 *
 * Terms that are genuinely ambiguous are ABSENT rather than guessed. "Digital"
 * is marketing about as often as it is IT; bare "compliance" is safety, finance
 * or legal depending on the industry; bare "security" is a firewall or a gate.
 * Each of those would silently mis-pool a whole audience, so titles carrying
 * only those words return `null` and are reported as ungrouped.
 */
const FAMILY_RULES: readonly { family: TitleFamily; terms: readonly string[] }[] = [
  {
    family: "HEALTH_SAFETY_AND_QUALITY",
    terms: [
      "health and safety",
      "safety",
      "hse",
      "ehs",
      "sheq",
      "qhse",
      "quality",
      "qa",
    ],
  },
  {
    family: "HR_AND_PEOPLE",
    terms: [
      "hr",
      "human resources",
      "people",
      "talent",
      "recruitment",
      "recruiting",
      "personnel",
      "learning and development",
      "training",
    ],
  },
  {
    family: "FINANCE",
    terms: [
      "finance",
      "financial",
      "cfo",
      "fd",
      "accounts",
      "accounting",
      "accountant",
      "controller",
      "treasury",
      "bookkeeper",
      "payroll",
    ],
  },
  {
    family: "PROCUREMENT",
    terms: ["procurement", "purchasing", "buyer", "buying", "sourcing"],
  },
  {
    family: "MARKETING",
    terms: [
      "marketing",
      "brand",
      "communications",
      "comms",
      "content",
      "cmo",
      "public relations",
    ],
  },
  {
    family: "SALES_AND_BUSINESS_DEVELOPMENT",
    terms: [
      "sales",
      "business development",
      "commercial",
      "account manager",
      "account executive",
      "revenue",
      "cro",
      "bdm",
      "bdr",
    ],
  },
  {
    family: "OPERATIONS",
    terms: [
      "operations",
      "operational",
      "ops",
      "coo",
      "production",
      "manufacturing",
      "plant",
      "facilities",
      "logistics",
      "supply chain",
      "warehouse",
      "fleet",
      "transport",
      "maintenance",
    ],
  },
  {
    family: "LEGAL",
    terms: [
      "legal",
      "counsel",
      "solicitor",
      "lawyer",
      "data protection",
      "gdpr",
      "company secretary",
    ],
  },
  {
    family: "IT_AND_ENGINEERING",
    terms: [
      "it",
      "cto",
      "cio",
      "technology",
      "technical",
      "software",
      "developer",
      "engineer",
      "engineering",
      "systems",
      "infrastructure",
      "information security",
      "cyber",
    ],
  },
  {
    family: "OWNER_OR_FOUNDER",
    terms: [
      "owner",
      "founder",
      "co founder",
      "proprietor",
      "managing director",
      "md",
      "ceo",
      "chief executive",
      "president",
      "general manager",
      "principal",
      "partner",
      "chairman",
      "chairwoman",
    ],
  },
];

/**
 * Which family a free-text job title belongs to, or `null` if we cannot tell.
 *
 * `null` is a first-class answer and the correct one for a large minority of a
 * real imported list. See the file header: guessing here would pool unrelated
 * jobs together, and every number computed downstream would inherit the guess.
 */
export function classifyTitleFamily(raw: string | null | undefined): TitleFamily | null {
  if (typeof raw !== "string") return null;
  const normalized = normalizeTitle(raw);
  if (!normalized) return null;

  for (const rule of FAMILY_RULES) {
    for (const term of rule.terms) {
      if (normalized.includes(` ${term} `)) return rule.family;
    }
  }
  return null;
}
