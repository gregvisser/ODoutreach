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
    sender_name: trimOrNull(sender.senderName),
    sender_email: trimOrNull(sender.senderEmail),
    sender_company_name: trimOrNull(sender.senderCompanyName),
    email_signature: trimOrNull(sender.emailSignature),
    unsubscribe_link: trimOrNull(sender.unsubscribeLink),
  };
}

const PLACEHOLDER_PATTERN = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

function renderString(
  input: string,
  values: Record<SequencePlaceholderKey, string | null>,
  usedPlaceholders: Set<SequencePlaceholderKey>,
  unknownPlaceholders: Set<string>,
  missingFields: Set<SequencePlaceholderKey>,
): string {
  return input.replace(PLACEHOLDER_PATTERN, (match, rawKey: string) => {
    const key = rawKey as string;
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
      missingFields.add(typed);
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
