/**
 * H3 (production hardening) — opt-out / complaint detection on prospect replies.
 *
 * The live Gmail/Graph path has no feedback loop, so the strongest real-world
 * complaint signal is a prospect REPLYING to demand removal ("please stop
 * emailing me", "unsubscribe me", "take me off your list", "this is spam").
 * Today such a reply is only recorded as REPLIED — the address is never
 * suppressed, so future campaigns can re-contact someone who explicitly asked
 * to stop. This pure classifier flags that intent so the caller can suppress.
 *
 * Robustness: we classify only the NEW reply text, not the quoted original.
 * Quoted content (the email we sent) carries our own "Unsubscribe:" footer and
 * the original pitch, which would otherwise cause false positives — so we strip
 * everything from the first quote marker onward before matching.
 */

const QUOTE_MARKERS: RegExp[] = [
  /^>.*/m, // quoted lines
  /^On\s.+\bwrote:\s*$/im, // "On <date> <person> wrote:"
  /^-{2,}\s*original message\s*-{2,}/im,
  /^_{5,}/m, // Outlook's underscore separator
  /^from:\s.+$/im, // forwarded/replied header block
  /^sent\s+from\s+my\s+\w+/im, // mobile signature often precedes quote
];

/** Keep only the new reply text (everything before the first quote marker). */
export function stripQuotedReply(body: string | null | undefined): string {
  const text = typeof body === "string" ? body : "";
  if (!text) return "";
  let cut = text.length;
  for (const re of QUOTE_MARKERS) {
    const m = text.match(re);
    if (m && typeof m.index === "number" && m.index < cut) {
      cut = m.index;
    }
  }
  return text.slice(0, cut).trim();
}

/**
 * Explicit opt-out / removal demands. Deliberately requires a clear instruction
 * (not just a soft "not interested") — but a bare "unsubscribe" counts, since in
 * a reply it is almost always an opt-out. False negatives are the worse failure
 * here (continuing to email someone who said stop is a compliance/complaint
 * risk), so the set leans toward catching genuine demands.
 */
const OPT_OUT_PATTERNS: Array<{ key: string; re: RegExp }> = [
  /**
   * The word our own outreach asks for. Every email sent on the mailto rail
   * ends "To opt out, reply STOP to this email and we'll remove you"
   * (`MAILTO_OPT_OUT_LINE`), and on that rail there is no unsubscribe link —
   * replying STOP is the entire opt-out mechanism. None of the patterns below
   * matched a bare STOP: `stop-emailing` needs a following verb object, so the
   * system asked for a word and then ignored it (found 2026-08-26).
   *
   * Anchored to a whole LINE, not a word boundary, so "we can stop the trial"
   * and "non-stop" do not fire. An optional reply prefix is allowed because
   * people also send it as the subject ("Re: STOP"), and a trailing `\r` is
   * matched explicitly because Microsoft Graph hands us CRLF bodies.
   */
  {
    key: "stop-keyword",
    re: /^[ \t*_"']*(?:(?:re|fwd|fw|sv|aw)\s*:\s*)*stop[ \t.!?*_"']*\r?$/im,
  },
  { key: "unsubscribe", re: /\bunsubscrib(e|ing)\b/i },
  { key: "stop-emailing", re: /\bstop\s+(email|contact|messag|sending|reaching)/i },
  { key: "remove-me", re: /\b(please\s+)?(remove|take)\s+me\s+(off|from|out)/i },
  { key: "remove-from-list", re: /\bremove\b.{0,30}\b(list|mailing|database|distribution)/i },
  { key: "opt-out", re: /\bopt[\s-]?out\b/i },
  { key: "do-not-contact", re: /\b(do\s*n['’o]?t|don['’]t|never)\s+(contact|email|e-mail|message|reach\s+out)/i },
  { key: "leave-me-alone", re: /\bleave\s+me\s+alone\b/i },
  { key: "no-longer-wish", re: /\bno\s+longer\s+(wish|want)\s+to\s+(receive|be\s+contacted|hear)/i },
  { key: "this-is-spam", re: /\b(this\s+is\s+spam|report(ing)?\s+(this\s+|you\s+)?(as\s+|for\s+)?spam|marked?\s+as\s+spam)\b/i },
  { key: "take-off-list", re: /\btake\s+(me\s+)?off\s+(your\s+)?(list|mailing)/i },
];

export type OptOutClassification = {
  isOptOut: boolean;
  /** Comma-separated matched pattern keys, for logs/audit. */
  evidence: string;
};

export function classifyOptOutReply(input: {
  subject: string | null | undefined;
  bodyText: string | null | undefined;
}): OptOutClassification {
  const subject = typeof input.subject === "string" ? input.subject : "";
  const newText = stripQuotedReply(input.bodyText);
  const haystack = `${subject}\n${newText}`;

  const matched = OPT_OUT_PATTERNS.filter((p) => p.re.test(haystack)).map(
    (p) => p.key,
  );

  return { isOptOut: matched.length > 0, evidence: matched.join(",") };
}
