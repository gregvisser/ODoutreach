/**
 * Detect when an inbound reply is, in plain language, asking to be removed
 * / unsubscribed — so staff get a loud flag and can one-click suppress the
 * contact via the existing Do-not-contact action.
 *
 * This is a FLAG, not auto-suppression. A human confirms. We therefore bias
 * hard toward PRECISION over recall: a false negative just means staff read
 * the reply themselves (status quo), but a false positive that auto-acted
 * would be the kind of thing that bites later. Greg chose flag-and-confirm
 * (option b) for exactly this reason.
 *
 * Two precision traps this guards against:
 *   1. The reply usually QUOTES our outbound, which ends with our own
 *      "Unsubscribe: <url>" footer. Matching a bare "unsubscribe" would then
 *      fire on almost every reply. We strip our footer + quoted lines first,
 *      and only match opt-out phrasing in REQUEST form ("remove me", "please
 *      unsubscribe", "unable to unsubscribe"), never a bare mention.
 *   2. Sales objections ("not interested") are NOT removal requests — a lead
 *      can be re-engaged later — so they are deliberately excluded.
 *
 * Scan the prospect's OWN words: subject + snippet + bodyPreview (the
 * top-of-reply text providers expose), never the full quoted thread.
 */

/** Footer/quote noise stripped before phrase matching. */
function stripQuotedAndFooter(text: string): string {
  return text
    .split(/\r?\n/)
    // Drop quoted-reply lines ("> ...") — that's the original we sent.
    .filter((line) => !/^\s*>/.test(line))
    .join("\n")
    // Remove our own plain-text unsubscribe footer URL (hosted or mailto)
    // so the literal word in OUR footer can't trigger the detector.
    .replace(/-{0,3}\s*unsubscribe:\s*(?:https?:\/\/|mailto:)\S+/gi, " ");
}

/** Normalise for matching: straighten apostrophes, lowercase, collapse ws. */
function normalise(text: string): string {
  return stripQuotedAndFooter(text)
    .replace(/[‘’ʼ]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Request-form opt-out phrases. Each is unlikely to appear except when the
 * sender is actually asking to be removed. Ordered most-specific first only
 * for nicer `signal` reporting; matching itself is order-independent.
 */
const REMOVAL_INTENT_PATTERNS: ReadonlyArray<{ id: string; re: RegExp }> = [
  { id: "remove me", re: /\bremove\s+(?:me|us)\b/ },
  {
    id: "remove from records",
    re: /\bremove\s+(?:me\s+|us\s+|my\s+\w+\s+)?from\s+(?:your|the)\s+(?:records|list|mailing list|database|system|crm|files)\b/,
  },
  {
    id: "remove my details",
    re: /\b(?:remove|delete|erase)\s+my\s+(?:details|data|email|e-mail|name|info|information|address|account)\b/,
  },
  { id: "take me off", re: /\btake\s+(?:me|us)\s+off\b/ },
  { id: "unsubscribe me", re: /\bunsubscribe\s+(?:me|us)\b/ },
  { id: "please unsubscribe", re: /\b(?:please|kindly)\s+unsubscribe\b/ },
  {
    id: "wish to unsubscribe",
    re: /\b(?:wish|want|need|would\s+like|trying|unable)\s+to\s+unsubscribe\b/,
  },
  { id: "cannot unsubscribe", re: /\b(?:can'?t|cannot|couldn'?t)\s+unsubscribe\b/ },
  { id: "opt out", re: /\bopt[\s-]?out\b/ },
  {
    id: "stop emailing",
    re: /\bstop\s+(?:emailing|e-mailing|contacting|messaging|sending)\b/,
  },
  {
    // Requires "<negation> contact me" ADJACENT, so the positive
    // "do not hesitate to contact me" does NOT match.
    id: "do not contact",
    re: /\b(?:do\s+not|do\s*n'?t|don'?t)\s+(?:contact|email|e-mail|message)\s+(?:me|us)\b/,
  },
  {
    id: "no longer wish",
    re: /\bno\s+longer\s+(?:wish|want)\s+to\s+(?:receive|be\s+contacted|hear)\b/,
  },
];

export type RemovalIntentParts = {
  subject?: string | null;
  snippet?: string | null;
  bodyPreview?: string | null;
};

export type RemovalIntentResult = {
  detected: boolean;
  /** Short label of the phrase family that matched, for UI / audit. */
  signal: string | null;
};

/** Scan a single already-collected text blob. Exported for unit tests. */
export function scanRemovalIntent(text: string | null | undefined): RemovalIntentResult {
  if (typeof text !== "string" || text.trim().length === 0) {
    return { detected: false, signal: null };
  }
  const normalised = normalise(text);
  for (const { id, re } of REMOVAL_INTENT_PATTERNS) {
    if (re.test(normalised)) {
      return { detected: true, signal: id };
    }
  }
  return { detected: false, signal: null };
}

/**
 * Detect removal intent across the prospect-authored parts of a reply.
 * Pass subject + snippet + bodyPreview (NOT the full quoted body).
 */
export function detectRemovalIntent(parts: RemovalIntentParts): RemovalIntentResult {
  const combined = [parts.subject, parts.snippet, parts.bodyPreview]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .join("\n");
  return scanRemovalIntent(combined);
}
