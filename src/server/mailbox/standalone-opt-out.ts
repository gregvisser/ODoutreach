import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { normalizeEmail } from "@/lib/normalize";
import { graphIdentityKey, type GraphMessageIdentity } from "./graph-message-identity";
import { suppressReplyOptOut } from "./opt-out-detection";

/** Keep an explicit request visible without inventing a campaign association.
 * Only a known contacted sender is automatically suppressed. A different person
 * asking on a company's behalf needs staff review of the intended recipient.
 */
export async function recordStandaloneOptOut(tx: Prisma.TransactionClient, input: {
  clientId: string; mailboxIdentityId: string; providerMessageId: string;
  fromEmail: string; toEmail: string | null; subject: string | null;
  bodyText?: string | null; bodyPreview: string | null; snippet: string | null;
  receivedAt: Date;
  graphIdentity?: GraphMessageIdentity;
}): Promise<{ created: false; replyId?: string }> {
  const from = normalizeEmail(input.fromEmail);
  const existing = await tx.inboundReply.findFirst({ where: {
    clientId: input.clientId, providerMessageId: input.providerMessageId,
  }, select: { id: true } });
  if (existing) return { created: false, replyId: existing.id };
  const contacted = await tx.outboundEmail.findFirst({ where: {
    clientId: input.clientId, mailboxIdentityId: input.mailboxIdentityId,
    toEmail: { equals: from, mode: "insensitive" },
    sentAt: { not: null, lte: input.receivedAt }, status: { in: ["SENT", "DELIVERED", "REPLIED"] },
  }, orderBy: { sentAt: "desc" }, select: { id: true, contactId: true } });
  if (contacted) await suppressReplyOptOut({
    clientId: input.clientId, fromEmail: from, subject: input.subject,
    bodyText: input.bodyText ?? input.bodyPreview ?? input.snippet,
    contactId: contacted.contactId, outboundEmailId: contacted.id, receivedAt: input.receivedAt,
  }, tx);
  const reply = await tx.inboundReply.create({ data: {
    clientId: input.clientId, providerMessageId: input.providerMessageId,
    fromEmail: from, toEmail: input.toEmail, subject: input.subject,
    bodyPreview: (input.bodyText ?? input.bodyPreview ?? input.snippet)?.slice(0, 12000),
    snippet: input.snippet, receivedAt: input.receivedAt,
    ingestionSource: "mailbox_sync", matchMethod: "UNLINKED",
    classificationRationale: "Removal request needs review. No campaign link has been assumed; check whether it names another person or company.",
    metadata: { kind: "standalone_opt_out", mailboxIdentityId: input.mailboxIdentityId,
      ...(input.graphIdentity ? { graphIdentity: graphIdentityKey(input.graphIdentity) } : {}) },
  } });
  // This is a review item, not a verified campaign reply or AI classification.
  return { created: false, replyId: reply.id };
}
