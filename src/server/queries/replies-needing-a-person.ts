import "server-only";

import { prisma } from "@/lib/db";
import { readHandlingStateFromMetadata } from "@/lib/inbox/inbound-message-handling";
import {
  buildNeedsAPersonQueue,
  type NeedsAPersonQueue,
  type ReplyTriageFact,
} from "@/lib/inbox/needs-a-person";

/**
 * Load every reply across every accessible workspace that may still be owed a
 * human, and let `buildNeedsAPersonQueue` decide which ones actually are.
 *
 * Tenant wall: the caller passes ids from `getAccessibleClientIds`, which
 * already excludes soft-deleted workspaces. Every query below is additionally
 * constrained by those ids — the screen is cross-client, so the wall is the
 * only thing keeping one client's prospects out of another's list.
 */

/**
 * How far back the screen looks.
 *
 * A reply nobody answered in a month is not going to be answered off the back
 * of this list, and an unbounded query over every reply ever would grow without
 * limit. Thirty days keeps the query bounded and the screen believable.
 */
export const NEEDS_A_PERSON_WINDOW_DAYS = 30;

/**
 * Hard ceiling on rows pulled into memory. Well above any realistic backlog
 * (the whole estate takes a few hundred replies a month), but it is a cap, so
 * the screen says when it has hit it rather than quietly showing a prefix.
 */
const MAX_ROWS = 500;

export type RepliesNeedingAPerson = NeedsAPersonQueue & {
  /** True when the row cap was hit and the list is not the whole story. */
  truncated: boolean;
  windowDays: number;
};

export async function getRepliesNeedingAPerson(
  accessibleClientIds: string[],
  now: Date = new Date(),
): Promise<RepliesNeedingAPerson> {
  const empty: RepliesNeedingAPerson = {
    ...buildNeedsAPersonQueue({ facts: [], now }),
    truncated: false,
    windowDays: NEEDS_A_PERSON_WINDOW_DAYS,
  };
  if (accessibleClientIds.length === 0) return empty;

  const since = new Date(
    now.getTime() - NEEDS_A_PERSON_WINDOW_DAYS * 86_400_000,
  );

  const replies = await prisma.inboundReply.findMany({
    where: {
      clientId: { in: accessibleClientIds },
      receivedAt: { gte: since },
    },
    // Newest first for the CAP only — so that if the ceiling is ever hit it is
    // the oldest, coldest replies that fall off rather than today's. The queue
    // itself re-sorts to longest-waiting-first afterwards.
    orderBy: { receivedAt: "desc" },
    take: MAX_ROWS,
    select: {
      id: true,
      clientId: true,
      fromEmail: true,
      subject: true,
      receivedAt: true,
      classification: true,
      classificationRationale: true,
      providerMessageId: true,
      client: { select: { name: true } },
      contact: { select: { isSuppressed: true } },
      linkedOutbound: { select: { mailboxIdentityId: true } },
    },
  });

  if (replies.length === 0) return empty;

  // The durable "somebody dealt with this" state lives on the correlated
  // InboundMailboxMessage's metadata JSON, keyed by the same
  // (clientId, mailboxIdentityId, providerMessageId) triple the reply-detail
  // page uses. Batched into one query rather than one per reply.
  const providerMessageIds = replies
    .map((r) => r.providerMessageId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const handlingByKey = new Map<string, { handledAt: Date | null; repliedAt: Date | null }>();
  if (providerMessageIds.length > 0) {
    const messages = await prisma.inboundMailboxMessage.findMany({
      where: {
        clientId: { in: accessibleClientIds },
        providerMessageId: { in: providerMessageIds },
      },
      select: {
        clientId: true,
        mailboxIdentityId: true,
        providerMessageId: true,
        metadata: true,
      },
    });

    for (const message of messages) {
      if (!message.providerMessageId) continue;
      const state = readHandlingStateFromMetadata(message.metadata);
      handlingByKey.set(
        correlationKey(
          message.clientId,
          message.mailboxIdentityId,
          message.providerMessageId,
        ),
        {
          handledAt: parseIsoOrNull(state.handledAt),
          repliedAt: parseIsoOrNull(state.lastRepliedAt),
        },
      );
    }
  }

  const facts: ReplyTriageFact[] = replies.map((reply) => {
    const mailboxIdentityId = reply.linkedOutbound?.mailboxIdentityId ?? null;
    const handling =
      reply.providerMessageId && mailboxIdentityId
        ? handlingByKey.get(
            correlationKey(
              reply.clientId,
              mailboxIdentityId,
              reply.providerMessageId,
            ),
          )
        : undefined;

    return {
      replyId: reply.id,
      clientId: reply.clientId,
      clientName: reply.client.name,
      fromEmail: reply.fromEmail,
      subject: reply.subject,
      receivedAt: reply.receivedAt,
      classification: reply.classification,
      classificationRationale: reply.classificationRationale,
      handledAt: handling?.handledAt ?? null,
      repliedAt: handling?.repliedAt ?? null,
      // A reply whose contact record is missing is NOT treated as suppressed.
      // Every unknown here resolves towards "a person should look", which is
      // the only safe direction for this screen.
      contactSuppressed: reply.contact?.isSuppressed ?? false,
    };
  });

  return {
    ...buildNeedsAPersonQueue({ facts, now }),
    truncated: replies.length === MAX_ROWS,
    windowDays: NEEDS_A_PERSON_WINDOW_DAYS,
  };
}

function correlationKey(
  clientId: string,
  mailboxIdentityId: string | null,
  providerMessageId: string,
): string {
  return `${clientId}|${mailboxIdentityId ?? ""}|${providerMessageId}`;
}

function parseIsoOrNull(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
