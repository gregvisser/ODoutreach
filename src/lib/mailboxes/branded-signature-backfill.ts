/**
 * Pure helpers for the branded-signature name backfill. Kept out of the
 * "use server" action file because a server-action module may only export
 * async functions.
 */

/** Generic confidentiality footer used when a client has no bespoke disclaimer. */
export const DEFAULT_SIGNATURE_DISCLAIMER =
  "This email and any attachments may be confidential. If you are not the intended recipient, please notify the sender and delete this message.";

/**
 * True when a stored mailbox signature is one of OUR auto-generated branded
 * signatures that is missing its name line — i.e. the pre-fix output (logo +
 * email + website, no person). Only these are safe to regenerate.
 *
 * Two guards keep it non-destructive:
 *   * `source === "manual"` AND the body carries our exact confidentiality
 *     footer — the fingerprint of the branded generator. A hand-written
 *     signature won't contain that footer, so it is never clobbered.
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
  if (!body.includes(DEFAULT_SIGNATURE_DISCLAIMER)) return false;
  const hasNameLine = body.includes(name) || (text ?? "").includes(name);
  return !hasNameLine;
}
