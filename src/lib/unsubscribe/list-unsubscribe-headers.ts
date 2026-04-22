/**
 * PR N — List-Unsubscribe / List-Unsubscribe-Post header helper.
 *
 * Returns the canonical RFC 2369 / RFC 8058 one-click unsubscribe
 * headers that Gmail and Yahoo require for bulk senders:
 *
 *   List-Unsubscribe: <https://.../unsubscribe/:rawToken>
 *   List-Unsubscribe-Post: List-Unsubscribe=One-Click
 *
 * Rules:
 *   * only accept absolute http(s) URLs (http localhost is allowed so
 *     local dev composes valid headers without extra config)
 *   * reject `mailto:` and any other scheme — this helper is strictly
 *     about the hosted one-click rail
 *   * reject values containing CR or LF — header injection is not
 *     possible, the helper never emits a header if the URL cannot be
 *     safely serialised on a single line
 *   * return `null` on any rejection so callers default to "no
 *     header" rather than emit a malformed header
 */

export type ListUnsubscribeHeaders = {
  listUnsubscribe: string;
  listUnsubscribePost: string;
};

export const LIST_UNSUBSCRIBE_POST_VALUE = "List-Unsubscribe=One-Click";

/**
 * Validate and build the standard one-click unsubscribe headers for
 * the given hosted unsubscribe URL. Returns `null` when the URL is
 * unusable — the caller should then skip header injection rather than
 * send a broken header.
 */
export function buildListUnsubscribeHeaders(
  unsubscribeUrl: string | null | undefined,
): ListUnsubscribeHeaders | null {
  if (typeof unsubscribeUrl !== "string") return null;
  // Header values must be single-line — any CR/LF anywhere in the
  // raw input is a hard reject to prevent header injection. We test
  // before trimming so a trailing `\r` (which would silently fall
  // off via `.trim()`) still trips the guard.
  if (/[\r\n]/.test(unsubscribeUrl)) return null;
  const trimmed = unsubscribeUrl.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  return {
    listUnsubscribe: `<${trimmed}>`,
    listUnsubscribePost: LIST_UNSUBSCRIBE_POST_VALUE,
  };
}

/**
 * RFC 5322-safe header pair ready to be joined into a raw MIME
 * message. Each entry is `Name: Value` with no trailing CRLF — the
 * caller is responsible for the CRLF separator between headers.
 */
export function listUnsubscribeHeadersToRfc5322Lines(
  headers: ListUnsubscribeHeaders,
): string[] {
  return [
    `List-Unsubscribe: ${headers.listUnsubscribe}`,
    `List-Unsubscribe-Post: ${headers.listUnsubscribePost}`,
  ];
}
