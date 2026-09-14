"use client";

import { useRef, useState, useTransition } from "react";

import {
  claimReplyAction,
  releaseReplyClaimAction,
} from "@/app/(app)/clients/[clientId]/activity/claim-actions";
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
  const [handling, setHandling] = useState<"idle" | "saving" | "saved" | "uncertain">("idle");
  const [savedLabel, setSavedLabel] = useState("Handled");
  const [error, setError] = useState<string | null>(null);
  const handlingLock = useRef(false);
  const controlsDisabled = pending || handling !== "idle";
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

  const markHandled = async () => {
    if (handlingLock.current || isHandled) return;
    handlingLock.current = true;
    setHandling("saving");
    setError(null);
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/replies/${encodeURIComponent(replyId)}/handled`, {
        method: "POST",
        credentials: "same-origin",
        signal: AbortSignal.timeout(30_000),
      });
      const result = await response.json();
      if (response.ok && result.ok === true) {
        setSavedLabel(typeof result.label === "string" ? result.label : "Handled");
        setHandling("saved");
      } else if (result.uncertain || response.status >= 500) {
        throw new Error("Uncertain save");
      } else {
        setError(result.reason ?? "The update was not accepted. Check the saved status before trying again.");
        setHandling("idle");
        handlingLock.current = false;
      }
    } catch {
      setError("We could not confirm the update. Check the saved status before trying again.");
      setHandling("uncertain");
    }
  };

  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-lg border border-border/70 bg-card px-4 py-3"
      data-testid="reply-ownership-card"
    >
      <span className="text-sm font-medium text-muted-foreground">
        Status:
      </span>
      <ReplyOwnershipBadge text={handling === "saved" ? savedLabel : label.text} tone={handling === "saved" ? "ok" : label.tone} />
      {handling === "saved" ? <span role="status" className="text-sm">Reply marked handled.</span> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {handling === "uncertain" || error ? <a href={replyPath} className="text-sm underline">Check saved status</a> : null}
      {isHandled || handling === "saved" ? null : (
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {isClaimed ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={controlsDisabled}
              onClick={release}
            >
              Release
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={controlsDisabled}
              onClick={claim}
            >
              Claim this reply
            </Button>
          )}
          <Button type="button" size="sm" disabled={controlsDisabled} onClick={markHandled}>
            {handling === "saving" ? "Saving…" : "Mark handled"}
          </Button>
        </div>
      )}
    </div>
  );
}
