import "server-only";

import { prisma } from "@/lib/db";
import { deriveInternalDomains } from "@/lib/inbox/internal-mail";

/**
 * F4 kill-switch (Prime Directive: mailbox-ingestion changes behind a flag).
 * Default ON; set `INBOUND_INTERNAL_MAIL_FILTER=off` to disable without a
 * deploy. When off, no internal-mail filtering happens (legacy behaviour).
 */
export function isInternalMailFilterEnabled(): boolean {
  return (
    (process.env.INBOUND_INTERNAL_MAIL_FILTER ?? "on").trim().toLowerCase() !==
    "off"
  );
}

/**
 * Audit M5/M6 — when on, the definitive thread-ref (In-Reply-To) reply match
 * additionally requires the sender to be the exact address we emailed
 * (`toEmail == from`), the same constraint the fuzzy fallback legs already
 * impose. This stops a forwarded / CC'd external third party on the thread from
 * being attributed to the original prospect (which would halt the wrong
 * sequence). Tradeoff: a genuine reply from a different address won't link via
 * this leg. Default OFF (Prime Directive: ingestion change behind a flag);
 * set `REPLY_THREAD_REF_SENDER_GUARD=true` to enable.
 */
export function isReplyThreadRefSenderGuardEnabled(): boolean {
  return (
    (process.env.REPLY_THREAD_REF_SENDER_GUARD ?? "").trim().toLowerCase() ===
    "true"
  );
}

/**
 * The workspace's own mailbox domains, used to recognise internal staff mail
 * during inbox sync. Derived from the client's connected mailbox addresses —
 * no schema change. Returns `[]` when the filter is disabled, which makes
 * every downstream internal-mail check a no-op.
 */
export async function resolveInternalDomainsForClient(
  clientId: string,
): Promise<string[]> {
  if (!isInternalMailFilterEnabled()) return [];
  const mailboxes = await prisma.clientMailboxIdentity.findMany({
    where: { clientId },
    select: { email: true },
  });
  return deriveInternalDomains(mailboxes.map((m) => m.email));
}
