"use client";

import { useTransition } from "react";

import {
  claimReplyAction,
  releaseReplyClaimAction,
} from "@/app/(app)/clients/[clientId]/activity/claim-actions";
import { markReplyHandledAction } from "@/app/(app)/clients/[clientId]/activity/replies/[replyId]/actions";
import { ReplyOwnershipBadge } from "@/components/activity/reply-ownership-badge";
import { Button } from "@/components/ui/button";
import type { ReplyClaimSubjectType } from "@/lib/inbox/reply-claim";

/**
 * Row 132 — the ownership status a team can actually see and act on, on the
 * reply detail page itself: who has this claimed (including "you", unlike
 * the passive `ReplyClaimNotice` banner above, which never names the
 * viewer), and a durable "mark handled" that is a different fact from
 * "Stop follow-ups" below (a person dealt with the conversation, vs. the
 * sequence stops sending).
 *
 * Advisory throughout — every button stays enabled regardless of who
 * claimed it. Claiming, releasing and marking handled are each one action
 * away, on purpose: this project's brief is explicit that an unclaimed
 * reply must never be defaulted to somebody, so nothing here auto-assigns.
 */
export function ReplyOwnershipCard({
  clientId,
  replyId,
  subjectType,
  subjectId,
  label,
  isClaimed,
  isHandled,
}: {
  clientId: string;
  replyId: string;
  subjectType: ReplyClaimSubjectType;
  subjectId: string;
  label: { text: string; tone: "muted" | "warn" | "ok" };
  isClaimed: boolean;
  isHandled: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const replyPath = `/clients/${clientId}/activity/replies/${replyId}`;

  const claim = () =>
    startTransition(async () => {
      await claimReplyAction({
        clientId,
        subjectType,
        subjectId,
        revalidateReplyPath: replyPath,
      });
    });

  const release = () =>
    startTransition(async () => {
      await releaseReplyClaimAction({
        clientId,
        subjectType,
        subjectId,
        revalidateReplyPath: replyPath,
      });
    });

  const markHandled = () =>
    startTransition(async () => {
      const result = await markReplyHandledAction({
        clientId,
        replyId,
        subjectType,
        subjectId,
      });
      if (!result.ok && typeof window !== "undefined") {
        window.alert(result.reason);
      }
    });

  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-lg border border-border/70 bg-card px-4 py-3"
      data-testid="reply-ownership-card"
    >
      <span className="text-sm font-medium text-muted-foreground">
        Status:
      </span>
      <ReplyOwnershipBadge text={label.text} tone={label.tone} />
      {isHandled ? null : (
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {isClaimed ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={release}
            >
              Release
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={claim}
            >
              Claim this reply
            </Button>
          )}
          <Button type="button" size="sm" disabled={pending} onClick={markHandled}>
            Mark handled
          </Button>
        </div>
      )}
    </div>
  );
}
