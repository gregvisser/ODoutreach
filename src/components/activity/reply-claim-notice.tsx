"use client";

import { useEffect, useRef } from "react";

import { claimReplyAction } from "@/app/(app)/clients/[clientId]/activity/claim-actions";
import type {
  ReplyClaimSubjectType,
  VisibleReplyClaim,
} from "@/lib/inbox/reply-claim";

/**
 * "Sarah Okafor opened this 2 minutes ago."
 *
 * Two jobs, deliberately in one component so a page cannot wire up half of
 * the feature:
 *
 *   1. Tell this operator that somebody else is already on it, BEFORE they
 *      act. It is ADVISORY — every button on the page stays enabled. A hard
 *      lock creates a worse problem than it solves: somebody opens a reply,
 *      goes to lunch, and a waiting prospect goes unanswered.
 *   2. Record that this operator has opened it, so the next person is told.
 *      This runs on mount rather than during the server render, so a link
 *      prefetch does not claim a reply nobody opened.
 *
 * The claim is written once per mount. Re-opening the page refreshes the
 * timestamp; it never stacks up rows.
 */
export function ReplyClaimNotice({
  clientId,
  subjectType,
  subjectId,
  claim,
}: {
  clientId: string;
  subjectType: ReplyClaimSubjectType;
  subjectId: string;
  /** Resolved server-side. `null` means say nothing. */
  claim: VisibleReplyClaim | null;
}) {
  const claimedRef = useRef(false);

  useEffect(() => {
    if (claimedRef.current) return;
    claimedRef.current = true;
    void claimReplyAction({ clientId, subjectType, subjectId }).catch(() => {
      // Advisory only — a failed claim must never disturb the page.
    });
  }, [clientId, subjectType, subjectId]);

  if (!claim) return null;

  return (
    <div
      className="rounded-lg border border-amber-400/50 bg-amber-50/50 px-4 py-3 dark:bg-amber-950/20"
      role="status"
    >
      <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
        {claim.name} opened this {claim.agoLabel}.
        {claim.othersCount > 0
          ? ` ${String(claim.othersCount)} other ${
              claim.othersCount === 1 ? "person has" : "people have"
            } it open too.`
          : ""}
      </p>
      <p className="mt-1 text-sm text-amber-800/90 dark:text-amber-200/80">
        Check with them before you reply, so this prospect doesn&apos;t get two
        answers. You can still act — nothing here is locked.
      </p>
    </div>
  );
}
