/**
 * Pure helpers for the branded-signature name backfill. Kept out of the
 * "use server" action file because a server-action module may only export
 * async functions.
 */

/** Generic confidentiality footer used when a client has no bespoke disclaimer. */
export const DEFAULT_SIGNATURE_DISCLAIMER =
  "This email and any attachments may be confidential. If you are not the intended recipient, please notify the sender and delete this message.";

/**
 * Fingerprints that identify HTML produced by our branded-signature generator
 * (`buildOpensDoorsBrandedSignatureHtml`). A match on ANY one means "we made
 * this", so a hand-written signature — arbitrary text/HTML typed into the
 * manual editor — is never mistaken for an auto-generated one.
 *
 *  - The presentation-table style is emitted verbatim by the template for every
 *    branded signature, whatever the disclaimer says. It is the most reliable
 *    signal and the reason we do NOT depend on the footer wording.
 *  - The two confidentiality footers are belt-and-braces: the one-click bulk
 *    action uses the "please notify" variant (DEFAULT_SIGNATURE_DISCLAIMER); the
 *    per-row "Set signature" branded template uses the "notify" variant (no
 *    "please"). Chevron's pre-fix signatures were made the per-row way, which is
 *    exactly why a please-only fingerprint missed them.
 */
const BRANDED_SIGNATURE_FINGERPRINTS: readonly string[] = [
  // The <table> style string from opensdoors-branded-signature-template.ts.
  'style="margin-top:12px;font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;font-size:13px;color:#111;"',
  DEFAULT_SIGNATURE_DISCLAIMER,
  "This email and any attachments may be confidential. If you are not the intended recipient, notify the sender and delete this message.",
];

/**
 * True when a stored mailbox signature is one of OUR auto-generated branded
 * signatures that is missing its name line — i.e. the pre-fix output (logo +
 * email + website, no person). Only these are safe to regenerate.
 *
 * Two guards keep it non-destructive:
 *   * `source === "manual"` AND the body carries one of our branded-generator
 *     fingerprints — a hand-written signature carries none, so it is never
 *     clobbered.
 *   * the resolved name is not already shown — a signature that already carries
 *     a name (auto or hand-tuned) is left untouched. The check is
 *     case-sensitive so the lower-case email local-part in the mailto link is
 *     not mistaken for the name line.
 */
export function brandedSignatureNeedsNameBackfill(args: {
  source: string | null;
  html: string | null;
  text: string | null;
  resolvedName: string | null;
}): boolean {
  const { source, html, text } = args;
  if (source !== "manual") return false;
  const name = args.resolvedName?.trim();
  if (!name) return false;
  const body = html ?? "";
  const looksBranded = BRANDED_SIGNATURE_FINGERPRINTS.some((fp) =>
    body.includes(fp),
  );
  if (!looksBranded) return false;
  const hasNameLine = body.includes(name) || (text ?? "").includes(name);
  return !hasNameLine;
}
