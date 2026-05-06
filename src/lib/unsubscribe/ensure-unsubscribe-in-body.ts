/**
 * Ensures a plain-text body contains a resolvable unsubscribe URL.
 * Callers must pass the **fully composed** body: template/sequence content
 * and mailbox (or brief) **signature** first; this function appends the
 * standard unsubscribe line **after** that, so the footer is never
 * interleaved with provider signature.
 *
 * If the URL already appears in the body, remove the raw occurrence and
 * append the standard footer at the end. That keeps the footer after the
 * ODoutreach-controlled signature without duplicating token URLs.
 */
export function ensureUnsubscribeLinkInPlainTextBody(
  body: string,
  unsubscribeUrl: string,
): string {
  const b = typeof body === "string" ? body : "";
  const u = typeof unsubscribeUrl === "string" ? unsubscribeUrl.trim() : "";
  if (!u) {
    return b;
  }
  const escaped = u.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const withoutExisting = b
    .replace(new RegExp(`(?:\\n\\s*)?---\\s*\\n\\s*Unsubscribe:\\s*${escaped}\\s*$`, "u"), "")
    .replace(new RegExp(`\\s*Unsubscribe:\\s*${escaped}\\s*`, "gu"), "\n")
    .replace(new RegExp(escaped, "gu"), "");
  const trimmed = withoutExisting.replace(/\s+$/u, "");
  const sep = trimmed.length > 0 ? "\n\n" : "";
  return `${trimmed}${sep}---\nUnsubscribe: ${u}\n`;
}
