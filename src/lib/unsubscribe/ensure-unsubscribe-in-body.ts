/**
 * Ensures a plain-text body contains a resolvable unsubscribe URL.
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
