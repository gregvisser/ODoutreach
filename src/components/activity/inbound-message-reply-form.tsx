"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  markInboundMailboxMessageHandledAction,
  replyToInboundMailboxMessageAction,
} from "@/app/(app)/clients/[clientId]/activity/messages/[messageId]/reply-actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  INBOUND_REPLY_BODY_MAX,
  validateReplyDraft,
} from "@/lib/inbox/inbound-reply-validation";

type Props = {
  clientId: string;
  inboundMessageId: string;
  /** Locked recipient — the original sender of the inbound message. */
  replyToEmail: string;
  /** Locked subject — "Re: …" derived on the server. */
  replySubject: string;
  fromMailboxEmail: string;
  canSend: boolean;
  canSendReason: string | null;
  alreadyHandled: boolean;
};

export function InboundMessageReplyForm({
  clientId,
  inboundMessageId,
  replyToEmail,
  replySubject,
  fromMailboxEmail,
  canSend,
  canSendReason,
  alreadyHandled,
}: Props) {
  const router = useRouter();
  const [bodyText, setBodyText] = useState("");
  const [banner, setBanner] = useState<{
    tone: "ok" | "err";
    text: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();
  const [handlePending, startHandleTransition] = useTransition();

  const clientValidation = validateReplyDraft({
    subject: replySubject,
    bodyText,
  });
  const disabled =
    pending || !canSend || clientValidation.ok === false;

  const onSend = () => {
    setBanner(null);
    if (!clientValidation.ok) {
      setBanner({ tone: "err", text: clientValidation.message });
      return;
    }
    if (!canSend) {
      setBanner({
        tone: "err",
        text:
          canSendReason ??
          "This mailbox is not eligible to send a reply right now.",
      });
      return;
    }
    startTransition(async () => {
      const result = await replyToInboundMailboxMessageAction({
        clientId,
        inboundMessageId,
        bodyText: clientValidation.trimmedBody,
      });
      if (result.ok) {
        setBanner({
          tone: "ok",
          text: `Reply sent from ${fromMailboxEmail} (${result.providerName}).`,
        });
        setBodyText("");
        router.refresh();
      } else {
        setBanner({ tone: "err", text: result.error });
      }
    });
  };

  const onMarkHandled = () => {
    setBanner(null);
    startHandleTransition(async () => {
      const result = await markInboundMailboxMessageHandledAction({
        clientId,
        inboundMessageId,
      });
      if (result.ok) {
        setBanner({
          tone: "ok",
          text: "Marked as handled.",
        });
        router.refresh();
      } else {
        setBanner({ tone: "err", text: result.error });
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-1 text-xs">
        <div className="flex items-baseline gap-2">
          <span className="min-w-24 text-muted-foreground">From</span>
          <span className="font-medium">{fromMailboxEmail}</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="min-w-24 text-muted-foreground">To</span>
          <span className="font-medium">{replyToEmail}</span>
          <span className="text-muted-foreground">(locked)</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="min-w-24 text-muted-foreground">Subject</span>
          <span className="font-medium">{replySubject}</span>
          <span className="text-muted-foreground">(locked)</span>
        </div>
      </div>

      <Textarea
        aria-label="Reply body"
        value={bodyText}
        disabled={pending}
        onChange={(e) => setBodyText(e.target.value)}
        rows={8}
        placeholder="Write your reply…"
        maxLength={INBOUND_REPLY_BODY_MAX}
      />

      <p className="rounded-md border border-amber-300/70 bg-amber-50/60 px-3 py-2 text-xs text-amber-900">
        <strong>This sends a real email reply from {fromMailboxEmail}.</strong>{" "}
        It threads against the original conversation when possible and counts
        against the 30/day per-mailbox cap. Suppression and connection state
        are re-checked at send time.
      </p>

      {!canSend && canSendReason ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {canSendReason}
        </p>
      ) : null}

      {banner ? (
        <p
          className={
            banner.tone === "ok"
              ? "rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
              : "rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          }
        >
          {banner.text}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={onSend}
          disabled={disabled}
          title={canSend ? undefined : canSendReason ?? undefined}
        >
          {pending ? "Sending reply…" : "Send reply"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={onMarkHandled}
          disabled={handlePending || alreadyHandled}
        >
          {alreadyHandled
            ? "Already handled"
            : handlePending
              ? "Saving…"
              : "Mark handled (no reply)"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Body: {bodyText.length} / {INBOUND_REPLY_BODY_MAX}
        </span>
      </div>
    </div>
  );
}
