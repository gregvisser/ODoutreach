/**
 * Canonical list of placeholders accepted in client email templates
 * (PR D4a). Splitting into recipient vs sender groups lets the UI
 * explain to the OpensDoors operator which values get filled in at
 * send time (PR D4b+) versus which come from the client workspace.
 *
 * Bridge note: snake_case is the canonical form. CamelCase aliases
 * (firstName, senderName, etc.) are intentionally NOT accepted here —
 * we promote a single shape in the UI. If a future PR needs to import
 * legacy camelCase content, add aliases via ALIAS_TO_CANONICAL so the
 * surface area stays small.
 */
export type PlaceholderGroup = "recipient" | "sender";

export type PlaceholderDescriptor = {
  key: string;
  group: PlaceholderGroup;
  /** Human label shown in the UI placeholder helper. */
  label: string;
  /** Short explanation shown as a tooltip / helper sub-line. */
  description: string;
};

/**
 * Target recipient / company — populated from the contact row that a
 * future sequence step resolves to at send time.
 */
export const RECIPIENT_PLACEHOLDERS: readonly PlaceholderDescriptor[] = [
  { key: "first_name", group: "recipient", label: "First name", description: "Contact.firstName" },
  { key: "last_name", group: "recipient", label: "Last name", description: "Contact.lastName" },
  { key: "full_name", group: "recipient", label: "Full name", description: "First + last name, trimmed" },
  { key: "company_name", group: "recipient", label: "Company name", description: "Target company — NOT the sending client" },
  { key: "role", group: "recipient", label: "Role / title", description: "Contact.role" },
  { key: "website", group: "recipient", label: "Website", description: "Target company website" },
  { key: "email", group: "recipient", label: "Email", description: "Target contact email" },
  { key: "phone", group: "recipient", label: "Phone", description: "Target contact phone" },
];

/**
 * Sender / client — populated from the OpensDoors-managed client
 * workspace that owns the sequence.
 */
export const SENDER_PLACEHOLDERS: readonly PlaceholderDescriptor[] = [
  { key: "sender_name", group: "sender", label: "Sender name", description: "Display name of the sending mailbox" },
  { key: "sender_email", group: "sender", label: "Sender email", description: "Email of the sending mailbox" },
  { key: "sender_company_name", group: "sender", label: "Sender company name", description: "Client workspace name — the sending organisation" },
  { key: "email_signature", group: "sender", label: "Email signature", description: "Configured sender signature for this client" },
  { key: "unsubscribe_link", group: "sender", label: "Unsubscribe link", description: "Compliance footer link injected at send time" },
];

export const ALL_PLACEHOLDERS: readonly PlaceholderDescriptor[] = [
  ...RECIPIENT_PLACEHOLDERS,
  ...SENDER_PLACEHOLDERS,
];

const KNOWN_KEYS: ReadonlySet<string> = new Set(ALL_PLACEHOLDERS.map((p) => p.key));

/** `{{ token }}` — whitespace allowed inside the braces. */
const PLACEHOLDER_PATTERN = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

export function isKnownPlaceholder(key: string): boolean {
  return KNOWN_KEYS.has(key);
}

/**
 * Extract every `{{ key }}` token present across the provided strings.
 * Duplicates ARE kept in `all` (so the UI can show usage counts), but
 * `unique` is what approval validation uses.
 */
export function extractPlaceholders(...inputs: string[]): {
  all: string[];
  unique: string[];
} {
  const all: string[] = [];
  for (const input of inputs) {
    if (typeof input !== "string" || input.length === 0) continue;
    const matches = input.matchAll(PLACEHOLDER_PATTERN);
    for (const m of matches) {
      const key = m[1];
      if (key) all.push(key);
    }
  }
  return { all, unique: Array.from(new Set(all)) };
}

export type PlaceholderValidationResult = {
  knownUsed: string[];
  unknown: string[];
};

/**
 * Classify placeholders into known vs unknown. Callers use this to
 * decide whether a template is allowed to transition to APPROVED —
 * see `canApproveTemplate` in `template-policy.ts`.
 */
export function validateTemplatePlaceholders(
  subject: string,
  content: string,
): PlaceholderValidationResult {
  const { unique } = extractPlaceholders(subject, content);
  const knownUsed: string[] = [];
  const unknown: string[] = [];
  for (const key of unique) {
    if (isKnownPlaceholder(key)) knownUsed.push(key);
    else unknown.push(key);
  }
  return { knownUsed, unknown };
}
