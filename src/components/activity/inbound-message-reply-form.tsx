"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore, useTransition } from "react";

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
import { forgetReplyAttempt, parseReplyAttempt, rememberReplyAttempt, replyAttemptStorageKey, type ReplyAttempt } from "@/lib/inbox/reply-attempt";

type Props = {
  staffUserId: string;
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

const subscribeToReady = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function InboundMessageReplyForm(props: Props) {
  const ready = useSyncExternalStore(subscribeToReady, clientReady, serverReady);
  // Restore tab-local confirmation state before enabling a send. Rendering the
  // storage-backed child only after hydration keeps server/client markup equal.
  return ready ? <ReadyReplyForm key={replyAttemptStorageKey(props.staffUserId, props.clientId, props.inboundMessageId)} {...props} /> : <p role="status">Preparing reply form…</p>;
}

function ReadyReplyForm({
  staffUserId,
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
  const storageKey = replyAttemptStorageKey(staffUserId, clientId, inboundMessageId);
  const [restored] = useState(() => {
    try { return { attempt: parseReplyAttempt(window.sessionStorage.getItem(storageKey)), error: null }; }
    catch { return { attempt: null, error: "The saved reply confirmation could not be read. Check the mailbox's Sent folder before sending again." }; }
  });
  const [attempt, setAttempt] = useState<ReplyAttempt | null>(restored.attempt);
  const [storageError, setStorageError] = useState<string | null>(restored.error);
  const [bodyText, setBodyText] = useState(restored.attempt?.bodyText ?? "");
  const inFlight = useRef(false);
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
    pending || !!storageError || (!attempt && (!canSend || clientValidation.ok === false));

  const onSend = () => {
    if (inFlight.current || storageError) return;
    setBanner(null);
    if (!clientValidation.ok) {
      setBanner({ tone: "err", text: clientValidation.message });
      return;
    }
    if (!canSend && !attempt) {
      setBanner({
        tone: "err",
        text:
          canSendReason ??
          "This mailbox is not eligible to send a reply right now.",
      });
      return;
    }
    let sending: ReplyAttempt;
    try {
      sending = attempt ?? { requestId: crypto.randomUUID(), bodyText: clientValidation.trimmedBody };
      // Persist BEFORE dispatch. If site storage is unavailable, no send starts.
      rememberReplyAttempt(window.sessionStorage, storageKey, sending);
      setAttempt(sending);
    } catch {
      setStorageError("Your browser could not preserve this reply attempt. Sending is paused; check any previous reply in the mailbox before trying again.");
      return;
    }
    inFlight.current = true;
    startTransition(async () => {
      try {
        const result = await replyToInboundMailboxMessageAction({
          clientId,
          inboundMessageId,
          bodyText: sending.bodyText,
          requestId: sending.requestId,
        });
        if (result.ok || result.safeToStartNewAttempt) {
          // A thrown/lost response never reaches this branch: its draft and ID
          // survive for a retry, including after a refresh in this browser tab.
          try {
            forgetReplyAttempt(window.sessionStorage, storageKey, sending.requestId);
          } catch {
            setStorageError(result.ok ? "The reply was sent, but this browser could not clear its saved confirmation. Refresh this page to recover it before composing another reply." : "The reply was not sent, but this browser could not clear its saved attempt. Refresh this page before trying again.");
            return;
          }
          setAttempt(null);
        }
        if (result.ok) {
          setBanner({
            tone: "ok",
            text: result.replayed ? "This reply was already sent. Its saved confirmation has been recovered." : `Reply sent from ${fromMailboxEmail}.`,
          });
          setBodyText("");
          router.refresh();
        } else {
          setBanner({ tone: "err", text: result.error });
        }
      } catch {
        setBanner({ tone: "err", text: "The reply confirmation was not received. Your draft is retained. Use Retry this reply to check the same attempt; do not compose it again in another tab." });
      } finally {
        inFlight.current = false;
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
        disabled={pending || !!attempt || !!storageError}
        onChange={(e) => setBodyText(e.target.value)}
        rows={8}
        placeholder="Write your reply…"
        maxLength={INBOUND_REPLY_BODY_MAX}
      />

      {attempt ? <p role="status" className="text-sm">A reply attempt is saved in this tab. Retry this reply to recover its confirmation. The text is locked until its outcome is known.</p> : null}
      {storageError ? <p role="alert" className="text-sm text-destructive">{storageError}</p> : null}

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
          title={canSend || attempt ? undefined : canSendReason ?? undefined}
        >
          {pending ? "Please wait…" : attempt ? "Retry this reply" : "Send reply"}
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
