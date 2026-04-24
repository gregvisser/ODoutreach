/**
 * Ensures a plain-text body contains a resolvable unsubscribe URL.
 * Callers must pass the **fully composed** body: template/sequence content
 * and mailbox (or brief) **signature** first; this function appends the
 * standard unsubscribe line **after** that, so the footer is never
 * interleaved with provider signature.
 *
 * If the URL is already present as a substring, the body is unchanged
 * (avoids duplicate footers when templates include {{unsubscribe_link}}).
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
  if (b.includes(u)) {
    return b;
  }
  const trimmed = b.replace(/\s+$/u, "");
  const sep = trimmed.length > 0 ? "\n\n" : "";
  return `${trimmed}${sep}---\nUnsubscribe: ${u}\n`;
}
