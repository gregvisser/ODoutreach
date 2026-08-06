/**
 * PR N — List-Unsubscribe / List-Unsubscribe-Post header helper.
 *
 * Two rails, deliberately separate:
 *
 * 1. **Hosted (RFC 8058 one-click).** Used when a client has a verified
 *    sender-aligned link domain (`go.<client-domain>`), so the URL sits on the
 *    same domain family as the sender:
 *
 *      List-Unsubscribe: <https://go.client.com/api/unsubscribe/:rawToken>
 *      List-Unsubscribe-Post: List-Unsubscribe=One-Click
 *
 *    The URL must answer POST, so callers pass the API route
 *    (`/api/unsubscribe/:rawToken`), not the human confirmation page
 *    (`/unsubscribe/:rawToken`, GET-only).
 *
 * 2. **Mailto.** Used when no aligned link domain exists — which is every
 *    client today. The address is the *sending mailbox itself*, so the header
 *    carries no domain other than the sender's:
 *
 *      List-Unsubscribe: <mailto:sender@client.com?subject=Unsubscribe>
 *
 *    `List-Unsubscribe-Post` is deliberately ABSENT here. RFC 8058 one-click
 *    is defined for HTTPS only; emitting the Post header alongside a mailto is
 *    malformed and hurts rather than helps. Opt-outs arriving this way are
 *    ingested by the normal reply sync and suppressed by
 *    `classifyOptOutReply`.
 *
 * Shared rules for both rails:
 *   * reject values containing CR or LF — the helper never emits a header it
 *     cannot safely serialise on a single line, so header injection is not
 *     possible
 *   * return `null` on any rejection so callers default to "no header" rather
 *     than emit a malformed one
 */

export type ListUnsubscribeHeaders = {
  listUnsubscribe: string;
  /**
   * Present only on the hosted HTTPS rail. Absent on the mailto rail — see the
   * RFC 8058 note above.
   */
  listUnsubscribePost?: string;
};

/**
 * The hosted rail always carries the one-click Post header, so its builder
 * returns this narrower type. Callers that need `listUnsubscribePost` as a
 * guaranteed string can depend on it without a cast or a null check.
 */
export type HostedListUnsubscribeHeaders = ListUnsubscribeHeaders & {
  listUnsubscribePost: string;
};

export const LIST_UNSUBSCRIBE_POST_VALUE = "List-Unsubscribe=One-Click";

/** Subject line prospects see when their mail client opens the opt-out draft. */
export const MAILTO_UNSUBSCRIBE_SUBJECT = "Unsubscribe";

/**
 * Validate and build the standard one-click unsubscribe headers for the given
 * hosted unsubscribe URL. Returns `null` when the URL is unusable — the caller
 * should then skip header injection rather than send a broken header.
 *
 * Strictly the hosted rail: `mailto:` and every other scheme is rejected here.
 * Use {@link buildMailtoUnsubscribeHeaders} for the mailto rail.
 */
export function buildListUnsubscribeHeaders(
  unsubscribeUrl: string | null | undefined,
): HostedListUnsubscribeHeaders | null {
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
 * Build the mailto unsubscribe header for a sending mailbox address.
 *
 * Returns `null` when the address is unusable, so the caller skips the header
 * rather than emitting a broken one. Intentionally omits
 * `List-Unsubscribe-Post` — see the RFC 8058 note in the module docblock.
 */
export function buildMailtoUnsubscribeHeaders(
  mailboxAddress: string | null | undefined,
): ListUnsubscribeHeaders | null {
  const address = normaliseUnsubscribeMailtoAddress(mailboxAddress);
  if (!address) return null;

  const subject = encodeURIComponent(MAILTO_UNSUBSCRIBE_SUBJECT);
  return {
    listUnsubscribe: `<mailto:${address}?subject=${subject}>`,
  };
}

/**
 * Normalise and validate an address for use as a mailto opt-out.
 *
 * Returns the trimmed, lowercased address, or `null` when it is unusable.
 * Shared by the header builder and the rail resolver so "is this a usable
 * opt-out address?" has exactly one definition — the governance gate and the
 * emitted header must never disagree about that.
 *
 * Deliberately conservative: exactly one `@`, a non-empty local part, and a
 * dotted domain. This is a compliance surface, so an address that does not
 * plainly look like a real mailbox is treated as no opt-out at all.
 */
export function normaliseUnsubscribeMailtoAddress(
  mailboxAddress: string | null | undefined,
): string | null {
  if (typeof mailboxAddress !== "string") return null;
  // Reject CR/LF before trimming, matching the hosted rail's guard: a trailing
  // `\r` would otherwise fall off silently via `.trim()`.
  if (/[\r\n]/.test(mailboxAddress)) return null;
  const address = mailboxAddress.trim().toLowerCase();
  if (!address) return null;

  // Angle brackets, quotes, commas and semicolons would break the header's own
  // grammar; whitespace inside an address is never valid here.
  if (/[<>,;"\s]/.test(address)) return null;

  const at = address.indexOf("@");
  if (at <= 0 || at !== address.lastIndexOf("@")) return null;
  const domain = address.slice(at + 1);
  if (!domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) {
    return null;
  }
  return address;
}

/**
 * RFC 5322-safe header lines ready to be joined into a raw MIME message. Each
 * entry is `Name: Value` with no trailing CRLF — the caller is responsible for
 * the CRLF separator between headers.
 *
 * Emits one line for the mailto rail and two for the hosted rail.
 */
export function listUnsubscribeHeadersToRfc5322Lines(
  headers: ListUnsubscribeHeaders,
): string[] {
  const lines = [`List-Unsubscribe: ${headers.listUnsubscribe}`];
  if (headers.listUnsubscribePost) {
    lines.push(`List-Unsubscribe-Post: ${headers.listUnsubscribePost}`);
  }
  return lines;
}
