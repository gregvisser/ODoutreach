"use client";

import Link from "next/link";
import { useTransition } from "react";
import { format } from "date-fns";

import {
  markEnrollmentCompletedAction,
  pauseEnrollmentAction,
  type EnrollmentActionResult,
} from "@/app/(app)/clients/[clientId]/activity/replies/[replyId]/actions";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * PR #137 — staff-friendly linked reply detail UI.
 *
 * Renders no raw enum values. Surfaces only the data needed for staff to:
 *   1. confirm the reply is genuinely linked to a sequence send,
 *   2. open the existing message detail page to reply from the original
 *      mailbox (no provider call here),
 *   3. stop or pause future follow-ups for the matching enrolment.
 */

type Props = {
  clientId: string;
  detail: {
    reply: {
      id: string;
      fromEmail: string;
      toEmail: string | null;
      subject: string | null;
      snippet: string | null;
      bodyPreview: string | null;
      receivedAt: string;
      matchMethod: string;
      ingestionSource: string;
    };
    contact: {
      id: string | null;
      fullName: string | null;
      email: string | null;
      isSuppressed: boolean;
    };
    linkedOutbound: {
      id: string;
      subject: string | null;
      sentAt: string | null;
      status: string;
    };
    mailbox: {
      id: string;
      email: string;
      displayName: string | null;
      provider: string;
      connectionStatus: string;
    };
    sequence: { id: string; name: string } | null;
    enrollment: {
      id: string;
      status: string;
      completedAt: string | null;
      pausedAt: string | null;
    } | null;
    inboundMailboxMessageId: string | null;
  };
};

function formatTs(iso: string | null): string {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "d MMM yyyy, HH:mm");
  } catch {
    return iso;
  }
}

function enrolmentStatusLabel(
  status: string | undefined,
): { label: string; tone: "default" | "secondary" | "outline" } {
  switch (status) {
    case "PENDING":
      return { label: "Active follow-ups", tone: "default" };
    case "COMPLETED":
      return { label: "Stopped (completed)", tone: "secondary" };
    case "PAUSED":
      return { label: "Paused", tone: "outline" };
    case "EXCLUDED":
      return { label: "Excluded (operator)", tone: "outline" };
    default:
      return { label: "Unknown", tone: "outline" };
  }
}

function mailboxConnectionLabel(status: string): string {
  switch (status) {
    case "CONNECTED":
      return "connected";
    case "DISCONNECTED":
      return "disconnected";
    case "PENDING":
      return "pending connection";
    default:
      return status.toLowerCase();
  }
}

export function ClientLinkedReplyDetail({ clientId, detail }: Props) {
  const [pending, startTransition] = useTransition();

  const enrolmentMeta = enrolmentStatusLabel(detail.enrollment?.status);
  const enrolmentLockedExcluded = detail.enrollment?.status === "EXCLUDED";
  const enrolmentAlreadyCompleted = detail.enrollment?.status === "COMPLETED";

  const handle = (
    runner: () => Promise<EnrollmentActionResult>,
  ) => () =>
    startTransition(async () => {
      const result = await runner();
      if (!result.ok && typeof window !== "undefined") {
        window.alert(result.reason);
      }
    });

  const replyHref = detail.inboundMailboxMessageId
    ? `/clients/${clientId}/activity/messages/${detail.inboundMailboxMessageId}`
    : null;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Link
            href={`/clients/${clientId}/activity`}
            className="underline-offset-4 hover:underline"
          >
            ← Activity
          </Link>
          {" · "}
          Sequence reply
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {detail.reply.subject && detail.reply.subject.length > 0
            ? detail.reply.subject
            : "(no subject)"}
        </h1>
        <p className="mt-1 text-muted-foreground">
          Reply received from{" "}
          <span className="font-medium text-foreground">
            {detail.contact.fullName ?? detail.reply.fromEmail}
          </span>{" "}
          to a sequence email sent from {detail.mailbox.email}.
        </p>
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Reply</CardTitle>
            <Badge variant="outline" className="font-normal">
              {detail.reply.ingestionSource === "mailbox_sync"
                ? "Synced from mailbox"
                : detail.reply.ingestionSource === "webhook"
                  ? "Provider webhook"
                  : "Captured"}
            </Badge>
          </div>
          <CardDescription>
            What the prospect replied. The full body is available on the
            mailbox message page when the reply was captured via mailbox sync.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
            <dt className="text-muted-foreground">From</dt>
            <dd className="font-medium break-all">
              {detail.contact.fullName
                ? `${detail.contact.fullName} <${detail.reply.fromEmail}>`
                : detail.reply.fromEmail}
            </dd>
            <dt className="text-muted-foreground">Received at</dt>
            <dd>{formatTs(detail.reply.receivedAt)}</dd>
            <dt className="text-muted-foreground">Subject</dt>
            <dd className="break-words">
              {detail.reply.subject ?? "(no subject)"}
            </dd>
            {detail.reply.toEmail ? (
              <>
                <dt className="text-muted-foreground">To</dt>
                <dd className="break-all">{detail.reply.toEmail}</dd>
              </>
            ) : null}
          </dl>
          {detail.reply.bodyPreview ? (
            <div className="rounded-md border border-border/70 bg-muted/10 px-3 py-3 text-sm whitespace-pre-wrap break-words">
              {detail.reply.bodyPreview}
            </div>
          ) : detail.reply.snippet ? (
            <div className="rounded-md border border-border/70 bg-muted/10 px-3 py-3 text-sm whitespace-pre-wrap break-words">
              {detail.reply.snippet}
            </div>
          ) : (
            <p className="rounded-md border border-border/70 bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
              No body preview was captured for this reply.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Reply from {detail.mailbox.email}</CardTitle>
          <CardDescription>
            Replies thread against the original conversation via the
            connected mailbox. This sends a real email when submitted — no
            email is sent from this page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {replyHref ? (
            <>
              <p>
                Open the linked inbox message to compose a reply from{" "}
                <span className="font-medium">
                  {detail.mailbox.displayName
                    ? `${detail.mailbox.displayName} <${detail.mailbox.email}>`
                    : detail.mailbox.email}
                </span>
                . The existing reply form (Microsoft 365 / Google Workspace)
                handles threading and the daily send cap.
              </p>
              <div>
                <Link
                  href={replyHref}
                  className={cn(buttonVariants({ variant: "default" }))}
                >
                  Open inbox view to reply →
                </Link>
              </div>
            </>
          ) : (
            <p className="rounded-md border border-amber-400/40 bg-amber-50/40 px-3 py-2 text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
              Replying inside ODoutreach is currently only supported for
              mailbox-synced replies. This reply was captured via{" "}
              <span className="font-medium">
                {detail.reply.ingestionSource === "webhook"
                  ? "the provider webhook"
                  : detail.reply.ingestionSource}
              </span>
              , so the original inbox message is not yet available here.
              Reply directly from {detail.mailbox.email} in the meantime.
            </p>
          )}
          {detail.mailbox.connectionStatus !== "CONNECTED" ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              Mailbox is currently {mailboxConnectionLabel(
                detail.mailbox.connectionStatus,
              )}
              . Reconnect the mailbox before sending replies.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Sequence enrolment</CardTitle>
            <Badge variant={enrolmentMeta.tone} className="font-normal">
              {enrolmentMeta.label}
            </Badge>
          </div>
          <CardDescription>
            Status of this prospect inside the linked sequence. Stopping
            here prevents any future follow-up sends for this enrolment.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
            <dt className="text-muted-foreground">Original send</dt>
            <dd className="break-words">
              {detail.linkedOutbound.subject ?? "(no subject)"}
            </dd>
            <dt className="text-muted-foreground">Sent at</dt>
            <dd>{formatTs(detail.linkedOutbound.sentAt)}</dd>
            <dt className="text-muted-foreground">Sequence</dt>
            <dd className="break-words">
              {detail.sequence?.name ?? "Unknown sequence"}
            </dd>
            <dt className="text-muted-foreground">Contact</dt>
            <dd className="break-words">
              {detail.contact.fullName ?? detail.reply.fromEmail}
              {detail.contact.isSuppressed ? (
                <span className="ml-2 text-xs text-amber-700 dark:text-amber-200">
                  (suppressed)
                </span>
              ) : null}
            </dd>
            {detail.enrollment?.completedAt ? (
              <>
                <dt className="text-muted-foreground">Stopped at</dt>
                <dd>{formatTs(detail.enrollment.completedAt)}</dd>
              </>
            ) : null}
            {detail.enrollment?.pausedAt ? (
              <>
                <dt className="text-muted-foreground">Paused at</dt>
                <dd>{formatTs(detail.enrollment.pausedAt)}</dd>
              </>
            ) : null}
          </dl>

          {detail.enrollment ? (
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Button
                type="button"
                variant="default"
                disabled={
                  pending ||
                  enrolmentLockedExcluded ||
                  enrolmentAlreadyCompleted
                }
                onClick={handle(() =>
                  markEnrollmentCompletedAction({
                    clientId,
                    enrollmentId: detail.enrollment!.id,
                    replyId: detail.reply.id,
                  }),
                )}
              >
                {enrolmentAlreadyCompleted
                  ? "Follow-ups already stopped"
                  : "Stop follow-ups"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={
                  pending ||
                  enrolmentLockedExcluded ||
                  enrolmentAlreadyCompleted ||
                  detail.enrollment.status === "PAUSED"
                }
                onClick={handle(() =>
                  pauseEnrollmentAction({
                    clientId,
                    enrollmentId: detail.enrollment!.id,
                    replyId: detail.reply.id,
                  }),
                )}
              >
                {detail.enrollment.status === "PAUSED"
                  ? "Already paused"
                  : "Pause follow-ups"}
              </Button>
              <span className="text-xs text-muted-foreground">
                Stopping or pausing prevents any future sends from this
                enrolment. No email is sent from this page.
              </span>
              {enrolmentLockedExcluded ? (
                <p className="w-full text-xs text-amber-700 dark:text-amber-400">
                  This contact is excluded from the sequence, so follow-ups are
                  already stopped — there&apos;s nothing more to do here.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="rounded-md border border-border/70 bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
              No sequence enrolment is attached to the original send — this
              reply is linked to an outbound that was sent outside the
              step-send planner. Follow-up stopping does not apply.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
