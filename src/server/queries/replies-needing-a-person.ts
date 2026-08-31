import "server-only";

import { prisma } from "@/lib/db";
import { readHandlingStateFromMetadata } from "@/lib/inbox/inbound-message-handling";
import {
  replyClaimSubjectKey,
  resolveReplyClaimSubject,
  type DisplayReplyClaim,
} from "@/lib/inbox/reply-claim";
import {
  buildNeedsAPersonQueue,
  type NeedsAPersonQueue,
  type ReplyTriageFact,
  type TriagedReply,
} from "@/lib/inbox/needs-a-person";
import { loadDisplayClaimsForSubjects } from "@/server/inbox/reply-claim";

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

/** A reply on this screen, plus who (if anyone) currently has it open. */
export type TriagedReplyWithClaim = TriagedReply & {
  claim: DisplayReplyClaim | null;
};

export type RepliesNeedingAPerson = Omit<NeedsAPersonQueue, "entries"> & {
  entries: TriagedReplyWithClaim[];
  /** True when the row cap was hit and the list is not the whole story. */
  truncated: boolean;
  windowDays: number;
};

export async function getRepliesNeedingAPerson(
  accessibleClientIds: string[],
  viewerStaffUserId: string,
  now: Date = new Date(),
): Promise<RepliesNeedingAPerson> {
  const empty: RepliesNeedingAPerson = {
    ...buildNeedsAPersonQueue({ facts: [], now }),
    entries: [],
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
      // Row 132 — durable "somebody dealt with this", owned by the reply
      // itself. OR'd below with the older, mailbox-message-scoped signal so
      // marking a reply handled through EITHER route removes it from this
      // queue — a reply can never look handled in one place and still
      // "waiting" in another.
      handledAt: true,
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

  const handlingByKey = new Map<
    string,
    { inboundMailboxMessageId: string; handledAt: Date | null; repliedAt: Date | null }
  >();
  if (providerMessageIds.length > 0) {
    const messages = await prisma.inboundMailboxMessage.findMany({
      where: {
        clientId: { in: accessibleClientIds },
        providerMessageId: { in: providerMessageIds },
      },
      select: {
        id: true,
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
          inboundMailboxMessageId: message.id,
          handledAt: parseIsoOrNull(state.handledAt),
          repliedAt: parseIsoOrNull(state.lastRepliedAt),
        },
      );
    }
  }

  const facts: (ReplyTriageFact & { inboundMailboxMessageId: string | null })[] = replies.map(
    (reply) => {
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
        // Row 132 — either the reply's own direct "handled" mark, or the
        // older mailbox-message-scoped one. Whichever fired first wins the
        // race; both mean the same thing to this screen.
        handledAt: reply.handledAt ?? handling?.handledAt ?? null,
        repliedAt: handling?.repliedAt ?? null,
        inboundMailboxMessageId: handling?.inboundMailboxMessageId ?? null,
        // A reply whose contact record is missing is NOT treated as suppressed.
        // Every unknown here resolves towards "a person should look", which is
        // the only safe direction for this screen.
        contactSuppressed: reply.contact?.isSuppressed ?? false,
      };
    },
  );

  const queue = buildNeedsAPersonQueue({ facts, now });

  // Row 132 — batch-load who (if anyone) has each still-waiting reply open,
  // so this screen can show "Claimed by X" and stop two people answering
  // the same prospect. Only for entries actually on the list — no point
  // loading claims for replies the triage rules already dropped.
  const subjectByReplyId = new Map(
    facts.map((f) => [
      f.replyId,
      resolveReplyClaimSubject({
        replyId: f.replyId,
        inboundMailboxMessageId: f.inboundMailboxMessageId,
      }),
    ]),
  );
  return {
    ...queue,
    entries: await attachClaims(queue.entries, subjectByReplyId, viewerStaffUserId, now),
    truncated: replies.length === MAX_ROWS,
    windowDays: NEEDS_A_PERSON_WINDOW_DAYS,
  };
}

/**
 * `ReplyClaim` reads are scoped by `clientId` (tenant wall), but this screen
 * is cross-client — so claims are loaded per client, in parallel, and merged
 * back onto the entries by reply id.
 */
async function attachClaims(
  entries: TriagedReply[],
  subjectByReplyId: Map<string, { subjectType: "INBOUND_MESSAGE" | "INBOUND_REPLY"; subjectId: string }>,
  viewerStaffUserId: string,
  now: Date,
): Promise<TriagedReplyWithClaim[]> {
  if (entries.length === 0) return [];

  const clientIds = Array.from(new Set(entries.map((e) => e.clientId)));
  const claimsByClient = await Promise.all(
    clientIds.map(async (clientId) => {
      const subjects = entries
        .filter((e) => e.clientId === clientId)
        .map((e) => subjectByReplyId.get(e.replyId))
        .filter((s): s is NonNullable<typeof s> => s !== undefined);
      const claims = await loadDisplayClaimsForSubjects({
        clientId,
        subjects,
        viewerStaffUserId,
        now,
      });
      return [clientId, claims] as const;
    }),
  );
  const claimsByClientId = new Map(claimsByClient);

  return entries.map((entry) => {
    const subject = subjectByReplyId.get(entry.replyId);
    const claims = claimsByClientId.get(entry.clientId);
    const claim = subject && claims ? (claims.get(replyClaimSubjectKey(subject)) ?? null) : null;
    return { ...entry, claim };
  });
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
