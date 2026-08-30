/**
 * Pure placeholder composition helper (PR D4e.1 — records only).
 *
 * Renders a `ClientEmailTemplate`'s subject + content by substituting
 * the canonical `{{ snake_case }}` tokens that
 * `src/lib/email-templates/placeholders.ts` accepts. Used by the
 * D4e.1 sequence-step-send planner to capture a preview snapshot on
 * READY rows and to classify rows as BLOCKED when required fields are
 * missing or unknown placeholders are referenced.
 *
 * Hard rules:
 *   * No I/O, no imports from Prisma, no network, no clock.
 *   * Unknown placeholders BLOCK composition (`ok === false`).
 *   * Missing required sender/recipient values BLOCK send-readiness
 *     via `missingFields`, but the composition object still renders
 *     for preview so operators can see exactly which tokens were
 *     substituted.
 *   * Only snake_case tokens are supported in D4e.1. CamelCase /
 *     aliasing is deferred so the surface area of D4e.2 stays small.
 *   * For send-readiness (`sendReady === true`) the contact MUST have
 *     an email and the sender MUST provide an unsubscribe link value —
 *     even if the template does not reference `{{ unsubscribe_link }}`.
 *     After the composed body (template + `{{email_signature}}`, etc.),
 *     the dispatcher appends a standard unsubscribe line when the link is
 *     not already in the body (`ensureUnsubscribeLinkInPlainTextBody`) so the
 *     footer always follows the signature.
 */

import {
  extractPlaceholders,
  isKnownPlaceholder,
  normalizePlaceholderKey,
} from "@/lib/email-templates/placeholders";

/** Canonical snake_case placeholder keys accepted in D4e.1. */
export type SequencePlaceholderKey =
  | "first_name"
  | "last_name"
  | "full_name"
  | "company_name"
  | "role"
  | "website"
  | "email"
  | "phone"
  | "sender_name"
  | "sender_email"
  | "sender_company_name"
  | "email_signature"
  | "unsubscribe_link";

export type SequenceCompositionContact = {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  company?: string | null;
  /** `Contact.title` — shown to operators as "role / title". */
  role?: string | null;
  website?: string | null;
  email?: string | null;
  mobilePhone?: string | null;
  officePhone?: string | null;
};

export type SequenceCompositionSender = {
  senderName?: string | null;
  senderEmail?: string | null;
  /** Sending client / workspace name, NOT the target company. */
  senderCompanyName?: string | null;
  emailSignature?: string | null;
  /** Required for send-readiness; D4e.2 will inject the footer at dispatch. */
  unsubscribeLink?: string | null;
};

export type SequenceCompositionInput = {
  subject: string;
  content: string;
  contact: SequenceCompositionContact;
  sender: SequenceCompositionSender;
};

export type SequenceCompositionResult = {
  /** `true` only when no unknown placeholders were referenced. */
  ok: boolean;
  /** Additional guard — true only when `ok` AND all send-critical fields are set. */
  sendReady: boolean;
  subject: string;
  body: string;
  /** Canonical tokens that appeared in subject/body (deduplicated). */
  usedPlaceholders: SequencePlaceholderKey[];
  /** Unknown tokens found in subject/body — blocks `ok`. */
  unknownPlaceholders: string[];
  /**
   * Canonical keys whose value was empty or missing at composition
   * time. Populated regardless of whether the template referenced
   * them — `sendReady` uses this to gate planning.
   */
  missingFields: SequencePlaceholderKey[];
  /** Non-blocking operator warnings. */
  warnings: string[];
};

const EMPTY_RESULT_FIELDS = {
  usedPlaceholders: [] as SequencePlaceholderKey[],
  unknownPlaceholders: [] as string[],
  missingFields: [] as SequencePlaceholderKey[],
  warnings: [] as string[],
};

function trimOrNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function looksLikeEmail(value: string): boolean {
  return /\S+@\S+\.\S+/.test(value);
}

/** "alex@trainhugger.com" → "Alex"; "sam.p@x.com" → "Sam P". */
function humanizeNameFromEmail(email: string): string | null {
  const local = email.split("@")[0] ?? "";
  const words = local
    .split(/[._\-+]+/)
    .map((w) => w.trim())
    .filter(Boolean);
  if (words.length === 0) return null;
  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Resolve the value for `{{ sender_name }}`. A sender name must read as a
 * person's name in a sign-off — never a raw email address. If the configured
 * display name is missing or actually an email, derive a friendly name from
 * the sender email's local part instead.
 */
export function resolveSenderNameForDisplay(
  senderName: string | null | undefined,
  senderEmail: string | null | undefined,
): string | null {
  const name = trimOrNull(senderName);
  if (name && !looksLikeEmail(name)) return name;

  const email = trimOrNull(senderEmail);
  if (email && looksLikeEmail(email)) {
    return humanizeNameFromEmail(email);
  }
  // Last resort: the only value we have is itself an email-looking string.
  if (name && looksLikeEmail(name)) {
    return humanizeNameFromEmail(name);
  }
  return name;
}

/**
 * Build the concrete substitution table for the provided contact +
 * sender. Values that are empty/missing resolve to `null` so the
 * renderer can report them as `missingFields` rather than emitting a
 * blank token.
 */
function buildValueTable(
  contact: SequenceCompositionContact,
  sender: SequenceCompositionSender,
): Record<SequencePlaceholderKey, string | null> {
  const first = trimOrNull(contact.firstName);
  const last = trimOrNull(contact.lastName);
  const full = trimOrNull(contact.fullName);
  const email = trimOrNull(contact.email);

  // first_name / last_name fall back from fullName when possible so
  // RocketReach rows that only populated fullName still render.
  let firstResolved = first;
  let lastResolved = last;
  if ((!firstResolved || !lastResolved) && full) {
    const parts = full.split(/\s+/).filter(Boolean);
    if (!firstResolved && parts.length > 0) firstResolved = parts[0] ?? null;
    if (!lastResolved && parts.length > 1)
      lastResolved = parts.slice(1).join(" ") || null;
  }

  const fullResolved =
    full ??
    (firstResolved && lastResolved
      ? `${firstResolved} ${lastResolved}`
      : (firstResolved ?? lastResolved ?? email ?? null));

  const phone =
    trimOrNull(contact.mobilePhone) ?? trimOrNull(contact.officePhone);

  return {
    first_name: firstResolved,
    last_name: lastResolved,
    full_name: fullResolved,
    company_name: trimOrNull(contact.company),
    role: trimOrNull(contact.role),
    website: trimOrNull(contact.website),
    email,
    phone,
    sender_name: resolveSenderNameForDisplay(sender.senderName, sender.senderEmail),
    sender_email: trimOrNull(sender.senderEmail),
    sender_company_name: trimOrNull(sender.senderCompanyName),
    email_signature: trimOrNull(sender.emailSignature),
    unsubscribe_link: trimOrNull(sender.unsubscribeLink),
  };
}

// Capture any inner text so human-friendly tokens like `{{First Name}}` are
// recognised, then normalised — never passed through to a recipient verbatim.
const PLACEHOLDER_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/g;

/**
 * Optional placeholders — when the template references one of these and the
 * value is empty, render an empty string but DO NOT block the send. The
 * dispatcher appends the mailbox signature on its own, so `{{email_signature}}`
 * is a convenience for layout, not a hard requirement.
 */
const OPTIONAL_PLACEHOLDERS: ReadonlySet<SequencePlaceholderKey> = new Set([
  "email_signature",
]);

function renderString(
  input: string,
  values: Record<SequencePlaceholderKey, string | null>,
  usedPlaceholders: Set<SequencePlaceholderKey>,
  unknownPlaceholders: Set<string>,
  missingFields: Set<SequencePlaceholderKey>,
): string {
  return input.replace(PLACEHOLDER_PATTERN, (match, rawKey: string) => {
    const key = normalizePlaceholderKey(rawKey);
    if (!isKnownPlaceholder(key)) {
      unknownPlaceholders.add(key);
      // Keep the token in the output so operators can spot which
      // placeholder was unknown when scanning the preview.
      return match;
    }
    const typed = key as SequencePlaceholderKey;
    usedPlaceholders.add(typed);
    const value = values[typed];
    if (value === null || value === undefined || value.length === 0) {
      if (!OPTIONAL_PLACEHOLDERS.has(typed)) {
        missingFields.add(typed);
      }
      return "";
    }
    return value;
  });
}

/** Canonical keys that MUST be non-empty for `sendReady`. */
const SEND_REQUIRED_FIELDS: readonly SequencePlaceholderKey[] = [
  "email",
  "sender_name",
  "sender_email",
  "sender_company_name",
  "unsubscribe_link",
];

export function composeSequenceEmail(
  input: SequenceCompositionInput,
): SequenceCompositionResult {
  const subjectSource = typeof input.subject === "string" ? input.subject : "";
  const contentSource = typeof input.content === "string" ? input.content : "";

  // Fast unknown-placeholder scan across both fields — the rendered
  // substitution below also reports these, but scanning up-front lets
  // us set `ok` deterministically even if a token appears only in the
  // subject.
  const { unique } = extractPlaceholders(subjectSource, contentSource);

  const values = buildValueTable(input.contact, input.sender);

  const used = new Set<SequencePlaceholderKey>();
  const unknown = new Set<string>();
  const missing = new Set<SequencePlaceholderKey>();

  for (const key of unique) {
    if (!isKnownPlaceholder(key)) unknown.add(key);
  }

  const subject = renderString(
    subjectSource,
    values,
    used,
    unknown,
    missing,
  );
  const body = renderString(contentSource, values, used, unknown, missing);

  // Enforce send-readiness requirements regardless of template usage:
  // the D4e.2 dispatcher will inject the compliance footer/unsubscribe
  // even if the template text does not reference it, so we need those
  // sender fields populated before a row can be READY.
  for (const key of SEND_REQUIRED_FIELDS) {
    if (values[key] === null) missing.add(key);
  }

  const warnings: string[] = [];
  if (unknown.size > 0) {
    warnings.push(
      `Template references unknown placeholder(s): ${Array.from(unknown)
        .sort()
        .map((k) => `{{${k}}}`)
        .join(", ")}. Approve a new template revision before preparing send records.`,
    );
  }
  if (missing.size > 0) {
    warnings.push(
      `Missing value for: ${Array.from(missing)
        .sort()
        .map((k) => `{{${k}}}`)
        .join(", ")}. Populate sender profile and contact fields before send.`,
    );
  }

  const ok = unknown.size === 0;
  const sendReady = ok && missing.size === 0;

  return {
    ok,
    sendReady,
    subject,
    body,
    usedPlaceholders: Array.from(used).sort(),
    unknownPlaceholders: Array.from(unknown).sort(),
    missingFields: Array.from(missing).sort(),
    warnings,
  };
}

/** Convenience constant exposed for tests and UI copy. */
export const SEQUENCE_SEND_REQUIRED_FIELDS = SEND_REQUIRED_FIELDS;

/**
 * Plain-English explanation of a missing field, for an operator who is not a
 * developer — never the raw `{{ snake_case }}` key. `fix` names a specific
 * product screen when one exists so the operator has a next step, not just a
 * diagnosis.
 */
const MISSING_FIELD_EXPLANATIONS: Record<
  SequencePlaceholderKey,
  { problem: string; fix: string }
> = {
  email: {
    problem: "this recipient has no email address on file",
    fix: "open Review recipients to fix it",
  },
  first_name: {
    problem: "this recipient has no first name on file",
    fix: "check the recipient's contact record",
  },
  last_name: {
    problem: "this recipient has no last name on file",
    fix: "check the recipient's contact record",
  },
  full_name: {
    problem: "this recipient has no name on file",
    fix: "check the recipient's contact record",
  },
  company_name: {
    problem: "this recipient has no company name on file",
    fix: "check the recipient's contact record",
  },
  role: {
    problem: "this recipient has no role or title on file",
    fix: "check the recipient's contact record",
  },
  website: {
    problem: "this recipient has no website on file",
    fix: "check the recipient's contact record",
  },
  phone: {
    problem: "this recipient has no phone number on file",
    fix: "check the recipient's contact record",
  },
  sender_name: {
    problem: "no sender name is set for this client",
    fix: "set one on the client's Mailboxes tab",
  },
  sender_email: {
    problem: "this client has no default sending email address set",
    // Deliberately the SAME fix text as unsubscribe_link below: the
    // fallback unsubscribe link is built from this same value, so setting
    // it once resolves both fields — the two problems should read as one
    // instruction, not two identical pointers at the same screen.
    fix: "set the client's default sending email on the Mailboxes tab",
  },
  sender_company_name: {
    problem: "no company name is set for this client",
    fix: "set one in the client's profile",
  },
  email_signature: {
    problem: "no signature is set for the sending mailbox",
    fix: "update the mailbox's signature on the client's Mailboxes tab",
  },
  unsubscribe_link: {
    problem: "no unsubscribe link could be created for this send",
    fix: "set the client's default sending email on the Mailboxes tab",
  },
};

function joinProblems(problems: readonly string[]): string {
  const [first, ...rest] = problems;
  const capitalized = (first ?? "").charAt(0).toUpperCase() + (first ?? "").slice(1);
  if (rest.length === 0) return capitalized;
  if (rest.length === 1) return `${capitalized} and ${rest[0]}`;
  return `${capitalized}, ${rest.slice(0, -1).join(", ")}, and ${rest[rest.length - 1]}`;
}

/**
 * Operator-facing reason a composition is not send-ready — names what is
 * missing in plain words and, where a product screen exists to fix it, which
 * screen. Groups fields that share the same fix into one sentence so a
 * client with no default sender email doesn't get two near-identical
 * complaints about it.
 *
 * Never leaks a raw placeholder key, table name, or id — this is shown
 * directly on an operator's screen.
 */
export function describeCompositionBlocker(
  result: SequenceCompositionResult,
): string {
  if (result.unknownPlaceholders.length > 0) {
    return "The template uses a placeholder ODoutreach doesn't recognize — fix it on the Templates tab before sending.";
  }
  if (result.missingFields.length === 0) {
    // Not send-ready with nothing missing is a genuinely unexpected state —
    // there is no specific field to name, so this is the one case where the
    // generic message is the honest one.
    return "Composition lost send-readiness between planning and dispatch; re-plan.";
  }

  const problemsByFix = new Map<string, string[]>();
  for (const key of result.missingFields) {
    const { problem, fix } = MISSING_FIELD_EXPLANATIONS[key];
    const problems = problemsByFix.get(fix) ?? [];
    problems.push(problem);
    problemsByFix.set(fix, problems);
  }

  return Array.from(problemsByFix.entries())
    .map(([fix, problems]) => `${joinProblems(problems)} — ${fix}.`)
    .join(" ");
}

/** Empty result helper — useful for defensive UI code paths. */
export function emptySequenceCompositionResult(): SequenceCompositionResult {
  return {
    ok: false,
    sendReady: false,
    subject: "",
    body: "",
    ...EMPTY_RESULT_FIELDS,
  };
}
