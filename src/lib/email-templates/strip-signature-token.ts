/**
 * F1 — remove the `{{email_signature}}` token from email-template content.
 *
 * A signature is a property of the sending mailbox and is appended at send;
 * a template must not embed one. The transmit path already de-dupes a
 * trailing signature, so removing the token does not change the email a
 * recipient receives — it removes the redundancy + the author confusion.
 *
 * Pure + idempotent. Used by the reviewed strip migration
 * (`scripts/f1-strip-template-signature.ts`).
 */

/** Stateless predicate — safe for repeated `.test()`. */
export function contentHasSignatureToken(content: string): boolean {
  return /\{\{\s*email_signature\s*\}\}/i.test(content);
}

/** Remove the token and tidy the whitespace it leaves behind. */
export function stripSignatureToken(content: string): string {
  return content
    // A line that is ONLY the token (optional surrounding whitespace).
    .replace(/^[ \t]*\{\{\s*email_signature\s*\}\}[ \t]*\r?\n?/gim, "")
    // Any remaining inline occurrences.
    .replace(/\{\{\s*email_signature\s*\}\}/gi, "")
    // Collapse 3+ newlines left behind down to a single blank line.
    .replace(/\n{3,}/g, "\n\n")
    // Drop trailing spaces a removed inline token may have left.
    .replace(/[ \t]+$/gm, "");
}
