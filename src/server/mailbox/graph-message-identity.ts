import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { normalizeEmail } from "@/lib/normalize";

export type GraphMessageIdentity = {
  clientId: string; mailboxIdentityId: string; internetMessageId: string;
  fromEmail: string; receivedAt: string;
};

/** A known historical conflict may hold one item without aborting other mail. */
export class GraphMessageIdentityConflictError extends Error {
  readonly code = "GRAPH_MESSAGE_IDENTITY_CONFLICT";
}

/** Only provider-supplied received time may participate in a move identity. */
export function graphMessageIdentity(input: {
  clientId: string; mailboxIdentityId: string; internetMessageId?: string | null;
  fromEmail: string; receivedDateTime?: string | null;
}): GraphMessageIdentity | undefined {
  const internetMessageId = input.internetMessageId?.trim();
  const received = input.receivedDateTime ? new Date(input.receivedDateTime) : null;
  if (!internetMessageId || !received || !Number.isFinite(received.getTime())) return undefined;
  return { clientId: input.clientId, mailboxIdentityId: input.mailboxIdentityId,
    internetMessageId, fromEmail: normalizeEmail(input.fromEmail), receivedAt: received.toISOString() };
}

export function graphIdentityKey(identity: GraphMessageIdentity): string {
  return JSON.stringify([identity.clientId, identity.mailboxIdentityId, identity.internetMessageId,
    identity.fromEmail, identity.receivedAt]);
}

export async function lockGraphMessageIdentity(tx: Prisma.TransactionClient, identity: GraphMessageIdentity) {
  const key = graphIdentityKey(identity);
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(
    hashtext('odoutreach.graph-message'), hashtext(${key}))`;
}

export function stringMetadata(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value : null;
}

/** Call under the stable lock. Never retain raw mail for a non-owning workspace. */
export async function canonicalGraphReplyId(tx: Prisma.TransactionClient, input: {
  clientId: string; providerMessageId: string; subject: string | null;
  graphIdentity?: GraphMessageIdentity; allowUnlinkedOptOut?: boolean;
}): Promise<string> {
  const identity = input.graphIdentity;
  if (!identity) return input.providerMessageId;
  const key = graphIdentityKey(identity);
  const matches = await tx.inboundReply.findMany({
    where: { clientId: input.clientId, OR: [
      { providerMessageId: input.providerMessageId },
      { metadata: { path: ["graphIdentity"], equals: key } },
    ] }, select: { id: true, providerMessageId: true, fromEmail: true, receivedAt: true, metadata: true,
      linkedOutbound: { select: { mailboxIdentityId: true } } }, take: 2,
  });
  if (matches.length > 1) throw new GraphMessageIdentityConflictError("Microsoft reply identity is ambiguous; administrator review required.");
  const existing = matches[0];
  if (existing) {
    const savedMailbox = existing.linkedOutbound?.mailboxIdentityId ?? stringMetadata(existing.metadata, "mailboxIdentityId");
    if (normalizeEmail(existing.fromEmail) !== identity.fromEmail ||
        existing.receivedAt.toISOString() !== identity.receivedAt ||
        (savedMailbox && savedMailbox !== identity.mailboxIdentityId)) {
      throw new GraphMessageIdentityConflictError("Microsoft reply identity conflicts with an existing reply.");
    }
    await tx.$executeRaw`UPDATE "InboundReply"
      SET metadata = (CASE WHEN jsonb_typeof(metadata) = 'object' THEN metadata ELSE '{}'::jsonb END)
        || ${JSON.stringify({ graphIdentity: key })}::jsonb
      WHERE id = ${existing.id} AND "clientId" = ${input.clientId}`;
    return existing.providerMessageId ?? input.providerMessageId;
  }
  if (input.allowUnlinkedOptOut === false) {
    // Old non-owner replies have no Internet Message-ID. A plausible historical
    // match needs evidence: don't guess its association or create a duplicate.
    const legacy = await tx.inboundReply.findMany({ where: {
      clientId: input.clientId, ingestionSource: "mailbox_sync",
      fromEmail: identity.fromEmail, receivedAt: new Date(identity.receivedAt), subject: input.subject,
      linkedOutbound: { mailboxIdentityId: identity.mailboxIdentityId },
    }, select: { metadata: true } });
    if (legacy.some(row => !stringMetadata(row.metadata, "graphIdentity"))) {
      throw new GraphMessageIdentityConflictError("Historical Microsoft reply identity needs verification before this mailbox can finish syncing.");
    }
  }
  return input.providerMessageId;
}
