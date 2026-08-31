import "server-only";

import { prisma } from "@/lib/db";
import {
  REPLY_CLAIM_STALE_AFTER_MS,
  replyClaimSubjectKey,
  selectDisplayClaim,
  selectVisibleClaim,
  type DisplayReplyClaim,
  type ReplyClaimSubject,
  type VisibleReplyClaim,
} from "@/lib/inbox/reply-claim";

/**
 * Reply claiming — the database side.
 *
 * ADVISORY, NOT A LOCK. Nothing here is consulted by a send gate, a
 * suppression check or a governance decision. These functions only decide
 * what the second operator is TOLD before they act, which is why every one
 * of them swallows its own errors: a claim that cannot be written or read is
 * a missing sentence on a page, and must never take down the reply page or
 * fail a send that has already left the building.
 *
 * Every read and every write is scoped by `clientId` as well as the row key,
 * like every other mutation in this codebase.
 */

/** Written when an operator opens a reply detail page. Idempotent. */
export async function claimReplyForStaff(args: {
  clientId: string;
  subject: ReplyClaimSubject;
  staffUserId: string;
  now?: Date;
}): Promise<void> {
  const claimedAt = args.now ?? new Date();
  try {
    await prisma.replyClaim.upsert({
      where: {
        clientId_subjectType_subjectId_staffUserId: {
          clientId: args.clientId,
          subjectType: args.subject.subjectType,
          subjectId: args.subject.subjectId,
          staffUserId: args.staffUserId,
        },
      },
      create: {
        clientId: args.clientId,
        subjectType: args.subject.subjectType,
        subjectId: args.subject.subjectId,
        staffUserId: args.staffUserId,
        claimedAt,
      },
      update: { claimedAt },
    });
  } catch {
    // Advisory only — see the module comment.
  }
}

/**
 * The claim to show this viewer, or `null` for "say nothing".
 *
 * Staleness is filtered twice on purpose: once in the query (so a busy
 * workspace does not drag rows it will discard over the wire) and once in
 * `selectVisibleClaim`, which is the copy of the rule that is unit-tested.
 */
export async function loadVisibleReplyClaim(args: {
  clientId: string;
  subject: ReplyClaimSubject;
  viewerStaffUserId: string;
  now?: Date;
}): Promise<VisibleReplyClaim | null> {
  const now = args.now ?? new Date();
  try {
    const rows = await prisma.replyClaim.findMany({
      where: {
        clientId: args.clientId,
        subjectType: args.subject.subjectType,
        subjectId: args.subject.subjectId,
        claimedAt: { gt: new Date(now.getTime() - REPLY_CLAIM_STALE_AFTER_MS) },
      },
      select: {
        staffUserId: true,
        claimedAt: true,
        staffUser: { select: { displayName: true, email: true } },
      },
    });

    return selectVisibleClaim({
      claims: rows.map((r) => ({
        staffUserId: r.staffUserId,
        displayName: r.staffUser.displayName,
        email: r.staffUser.email,
        claimedAt: r.claimedAt,
      })),
      viewerStaffUserId: args.viewerStaffUserId,
      now,
    });
  } catch {
    return null;
  }
}

/**
 * Row 132 — the claim to show for EVERY reply on a list screen, in one
 * query. Unlike `loadVisibleReplyClaim` (one subject, hides the viewer's own
 * claim — built for the "warn the second person" banner), this includes the
 * viewer's own claim, because a list row answering "who has this" needs
 * "you" as a possible answer.
 *
 * Subjects with no live claim are simply absent from the returned map —
 * callers treat a missing key the same as `null`.
 */
export async function loadDisplayClaimsForSubjects(args: {
  clientId: string;
  subjects: ReplyClaimSubject[];
  viewerStaffUserId: string;
  now?: Date;
}): Promise<Map<string, DisplayReplyClaim>> {
  const now = args.now ?? new Date();
  const out = new Map<string, DisplayReplyClaim>();
  if (args.subjects.length === 0) return out;

  try {
    const rows = await prisma.replyClaim.findMany({
      where: {
        clientId: args.clientId,
        OR: args.subjects.map((s) => ({
          subjectType: s.subjectType,
          subjectId: s.subjectId,
        })),
        claimedAt: { gt: new Date(now.getTime() - REPLY_CLAIM_STALE_AFTER_MS) },
      },
      select: {
        subjectType: true,
        subjectId: true,
        staffUserId: true,
        claimedAt: true,
        staffUser: { select: { displayName: true, email: true } },
      },
    });

    const claimsBySubject = new Map<
      string,
      { staffUserId: string; displayName: string | null; email: string; claimedAt: Date }[]
    >();
    for (const row of rows) {
      const key = replyClaimSubjectKey({
        subjectType: row.subjectType,
        subjectId: row.subjectId,
      });
      const list = claimsBySubject.get(key) ?? [];
      list.push({
        staffUserId: row.staffUserId,
        displayName: row.staffUser.displayName,
        email: row.staffUser.email,
        claimedAt: row.claimedAt,
      });
      claimsBySubject.set(key, list);
    }

    for (const subject of args.subjects) {
      const key = replyClaimSubjectKey(subject);
      const claims = claimsBySubject.get(key);
      if (!claims) continue;
      const display = selectDisplayClaim({
        claims,
        viewerStaffUserId: args.viewerStaffUserId,
        now,
      });
      if (display) out.set(key, display);
    }
  } catch {
    // Advisory only — see the module comment. Whatever failed, an empty map
    // ("say nothing") is the safe fallback, never a thrown error.
    return new Map();
  }

  return out;
}

/**
 * Somebody acted on the conversation — replied, suppressed, or marked it
 * handled. Every claim on it goes, including other people's: the thing is
 * dealt with, so nobody should still be told "Sarah is handling this".
 *
 * Who actually did it is recorded permanently elsewhere (the outbound email's
 * initiator, `handledByStaffUserId`, the do-not-contact entry). The claim is
 * not permanent and is simply deleted.
 */
export async function releaseReplyClaims(args: {
  clientId: string;
  subject: ReplyClaimSubject;
}): Promise<void> {
  try {
    await prisma.replyClaim.deleteMany({
      where: {
        clientId: args.clientId,
        subjectType: args.subject.subjectType,
        subjectId: args.subject.subjectId,
      },
    });
  } catch {
    // Advisory only — see the module comment.
  }
}
