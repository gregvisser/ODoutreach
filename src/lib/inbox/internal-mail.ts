/**
 * Internal-mail detection for inbound mailbox sync (F4).
 *
 * The inbox sync ingests every message in a connected mailbox, including
 * internal staff threads (both parties on the workspace's own domain). Those
 * must never be matched to, or surfaced as, a prospect conversation.
 *
 * A genuine prospect reply ALWAYS comes from an external address, so we only
 * treat a message as internal when BOTH ends are on an internal domain. This
 * is deliberately conservative — it must never drop a real reply such as
 * `alex.ullmann@pxc.co.uk -> sam.p@trainhugger.com` (the external sender keeps
 * it out of the internal bucket).
 *
 * Internal domains are DERIVED from the workspace's own connected mailbox
 * addresses — every mailbox a client sends/receives from is, by definition,
 * their own domain — so no schema change or per-client config is required.
 *
 * This is pure: no Prisma, no env. Callers pass the derived domain list.
 */

/** Lowercased domain of an email, or null if not a parseable address. */
export function emailDomain(email: string | null | undefined): string | null {
  if (typeof email !== "string") return null;
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return domain.length > 0 ? domain : null;
}

/** Unique lowercased domains of the workspace's own mailbox addresses. */
export function deriveInternalDomains(
  mailboxEmails: ReadonlyArray<string | null | undefined>,
): string[] {
  const set = new Set<string>();
  for (const email of mailboxEmails) {
    const domain = emailDomain(email);
    if (domain) set.add(domain);
  }
  return [...set];
}

/**
 * True when a synced message is internal staff mail — BOTH sender and
 * recipient are on a workspace-internal domain. If either end is unknown or
 * external, returns false (keep the message; never risk dropping a real
 * prospect reply).
 */
export function isInternalMail(input: {
  fromEmail: string | null | undefined;
  toEmail: string | null | undefined;
  internalDomains: readonly string[];
}): boolean {
  if (input.internalDomains.length === 0) return false;
  const set = new Set(input.internalDomains.map((d) => d.toLowerCase()));
  const from = emailDomain(input.fromEmail);
  const to = emailDomain(input.toEmail);
  if (!from || !to) return false;
  return set.has(from) && set.has(to);
}
