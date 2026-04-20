/**
 * Contact import contract (CSV + RocketReach).
 *
 * Captures the exact heading set Greg approved in the audit
 * (docs/ops/CLIENT_WORKSPACE_MODULE_AUDIT.md §0.1) and the validity rules
 * derived from it. This is the single source of truth for:
 *
 *   - acceptable CSV / RocketReach column headings,
 *   - alias → Contact-field mapping,
 *   - "valid" and "email-sendable" contact rules.
 *
 * Persistence note: the current `Contact` schema still requires `email`.
 * LinkedIn / mobile / office / location / city / country are first-class
 * columns as of the PR C migration, but email-optional persistence is a
 * deferred follow-up. See `EMAIL_REQUIRED_FOR_PERSISTENCE` below.
 */

/**
 * Canonical headings — exact names Greg specified. CSV importers must
 * accept these (they are matched case-insensitively with whitespace
 * collapsed via {@link normalizeHeading}). Fields may be empty.
 */
export const CANONICAL_IMPORT_HEADINGS = [
  "Name",
  "Employer",
  "Title",
  "First Name",
  "Last Name",
  "Location",
  "City",
  "Country",
  "LinkedIn",
  "Job1 Title",
  "A Emails",
  "Mobile Phone Number",
  "Office Number",
] as const;

export type CanonicalImportHeading = (typeof CANONICAL_IMPORT_HEADINGS)[number];

/**
 * Until the email-optional follow-up lands, the CSV/RocketReach importers
 * still require a usable email to persist a row. UI must show this.
 */
export const EMAIL_REQUIRED_FOR_PERSISTENCE = true as const;

export type ContactImportField =
  | "fullName"
  | "company"
  | "title"
  | "firstName"
  | "lastName"
  | "location"
  | "city"
  | "country"
  | "linkedIn"
  | "email"
  | "mobilePhone"
  | "officePhone";

type MappingEntry = {
  heading: CanonicalImportHeading;
  field: ContactImportField;
  aliases: readonly string[];
  /** A lower-priority heading that feeds the same field only when the primary is empty. */
  fallbackOnly?: boolean;
};

/**
 * Canonical → Contact-field mapping. Aliases include the legacy headers the
 * CSV importer already supported (e.g. `email`, `full_name`, `company`) so
 * existing operator CSVs keep working.
 */
export const CONTACT_IMPORT_MAPPING: readonly MappingEntry[] = [
  {
    heading: "Name",
    field: "fullName",
    aliases: ["Name", "Full Name", "full_name", "fullname"],
  },
  {
    heading: "Employer",
    field: "company",
    aliases: ["Employer", "Company", "Organization", "Org", "Account"],
  },
  {
    heading: "Title",
    field: "title",
    aliases: ["Title", "Job Title", "Role"],
  },
  {
    heading: "First Name",
    field: "firstName",
    aliases: ["First Name", "First", "FirstName", "fname"],
  },
  {
    heading: "Last Name",
    field: "lastName",
    aliases: ["Last Name", "Last", "LastName", "lname"],
  },
  {
    heading: "Location",
    field: "location",
    aliases: ["Location"],
  },
  {
    heading: "City",
    field: "city",
    aliases: ["City"],
  },
  {
    heading: "Country",
    field: "country",
    aliases: ["Country"],
  },
  {
    heading: "LinkedIn",
    field: "linkedIn",
    aliases: ["LinkedIn", "LinkedIn URL", "LinkedIn Profile", "linkedin_url"],
  },
  {
    heading: "Job1 Title",
    field: "title",
    aliases: ["Job1 Title", "Job 1 Title"],
    fallbackOnly: true,
  },
  {
    heading: "A Emails",
    field: "email",
    aliases: ["A Emails", "Email", "E-mail", "Work Email", "Email Address"],
  },
  {
    heading: "Mobile Phone Number",
    field: "mobilePhone",
    aliases: ["Mobile Phone Number", "Mobile", "Mobile Number", "Cell"],
  },
  {
    heading: "Office Number",
    field: "officePhone",
    aliases: [
      "Office Number",
      "Office Phone",
      "Office",
      "Landline",
      "Work Phone",
    ],
  },
];

/**
 * Normalize a heading for comparison: lowercase, treat underscores as spaces,
 * collapse whitespace. This lets `First Name`, `first_name`, `First-Name`,
 * and `  FIRST   NAME ` all resolve to the same canonical entry.
 */
export function normalizeHeading(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ");
}

/** Lookup table: normalized heading/alias → entry. */
const HEADING_INDEX: Map<string, MappingEntry> = (() => {
  const map = new Map<string, MappingEntry>();
  for (const entry of CONTACT_IMPORT_MAPPING) {
    for (const alias of entry.aliases) {
      const key = normalizeHeading(alias);
      if (!map.has(key)) map.set(key, entry);
    }
  }
  return map;
})();

/**
 * Resolved per-field values after reading a single row. Undefined means
 * the header wasn't present in the file at all; empty string means the
 * header was present but the cell was empty (both are acceptable per the
 * import contract — fields may be empty).
 */
export type MappedContactRow = Partial<Record<ContactImportField, string>>;

type RawRow = Record<string, string | null | undefined>;

/**
 * Map a single raw CSV row (keyed by its original heading strings) to
 * canonical Contact fields. Primary entries win; `fallbackOnly` entries
 * only fill a field when the primary value is empty.
 */
export function mapContactRow(row: RawRow): MappedContactRow {
  const result: MappedContactRow = {};
  const fallbacks: MappedContactRow = {};

  for (const [rawHeading, rawValue] of Object.entries(row)) {
    const entry = HEADING_INDEX.get(normalizeHeading(rawHeading));
    if (!entry) continue;
    const value = typeof rawValue === "string" ? rawValue.trim() : "";
    const bucket = entry.fallbackOnly ? fallbacks : result;
    if (!(entry.field in bucket) || bucket[entry.field] === "") {
      bucket[entry.field] = value;
    }
  }

  for (const field of Object.keys(fallbacks) as ContactImportField[]) {
    const primary = result[field];
    if (!primary || primary.trim() === "") {
      const fb = fallbacks[field];
      if (fb !== undefined) result[field] = fb;
    }
  }

  return result;
}

/**
 * Is a mapped row strong enough to count as a valid contact per Greg's rules?
 * This is *intake* validity and does not consult suppression (the suppression
 * guard decides that downstream).
 */
export function rowHasOutreachIdentifier(mapped: MappedContactRow): boolean {
  return (
    hasNonEmpty(mapped.email) ||
    hasNonEmpty(mapped.linkedIn) ||
    hasNonEmpty(mapped.mobilePhone) ||
    hasNonEmpty(mapped.officePhone)
  );
}

export function rowIsEmailSendable(mapped: MappedContactRow): boolean {
  return hasNonEmpty(mapped.email);
}

function hasNonEmpty(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Human-readable description of the import contract, suitable for rendering
 * in the Sources / Contacts UI panels.
 */
export const CONTACT_IMPORT_CONTRACT_SUMMARY = {
  headings: CANONICAL_IMPORT_HEADINGS,
  rules: [
    "Fields may be empty — only the headings above are needed.",
    "A contact is valid if it is not suppressed and has at least one of: email, LinkedIn, mobile phone, or office phone.",
    "A contact is email-sendable only if it is valid and has an email address.",
    "Email is currently required for persistence; LinkedIn-only and phone-only contacts will be supported once email-optional persistence lands (follow-up).",
  ],
} as const;
