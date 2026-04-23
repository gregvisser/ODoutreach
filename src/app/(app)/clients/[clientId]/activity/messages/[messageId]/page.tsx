import Link from "next/link";
import { notFound } from "next/navigation";

import { InboundMessageFullBody } from "@/components/activity/inbound-message-full-body";
import { InboundMessageReplyForm } from "@/components/activity/inbound-message-reply-form";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buildReplySubject } from "@/lib/inbox/inbound-message-handling";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { loadInboundMessageDetailForClient } from "@/server/inbox/inbound-message-detail";
import { mailboxIneligibleForGovernedSendExecution, humanizeGovernanceRejection } from "@/server/mailbox/sending-policy";
import { getAccessibleClientIds } from "@/server/tenant/access";
import { loadClientWorkspaceBundle } from "@/server/queries/client-workspace-bundle";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ clientId: string; messageId: string }>;
};

function formatDateTime(d: Date | null | undefined): string {
  if (!d) return "—";
  try {
    return `${d.toISOString().replace("T", " ").slice(0, 16)} UTC`;
  } catch {
    return "—";
  }
}

export default async function InboundMessageDetailPage({ params }: Props) {
  const staff = await requireOpensDoorsStaff();
  const accessible = await getAccessibleClientIds(staff);
  const { clientId, messageId } = await params;

  const bundle = await loadClientWorkspaceBundle(clientId, accessible, staff);
  if (!bundle.client) notFound();

  const detail = await loadInboundMessageDetailForClient(clientId, messageId);
  if (!detail) notFound();

  const { message, mailbox, handling, replyHistory, linkedReply } = detail;
  const replySubject = buildReplySubject(message.subject);
  const ineligibleCode = mailboxIneligibleForGovernedSendExecution(mailbox);
  const providerSupportsReply =
    mailbox.provider === "MICROSOFT" || mailbox.provider === "GOOGLE";
  const canSend = ineligibleCode === null && providerSupportsReply;
  let canSendReason: string | null = null;
  if (ineligibleCode) {
    // humanizeGovernanceRejection only reads `.email` off the mailbox so we
    // pass `null` and prepend the address for the operator context.
    canSendReason = `${humanizeGovernanceRejection(ineligibleCode, null)} (${mailbox.email})`;
  } else if (!providerSupportsReply) {
    canSendReason = `Replies are only supported on Microsoft 365 and Google Workspace mailboxes (this mailbox is ${mailbox.provider}).`;
  }

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
          Inbound message
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {message.subject && message.subject.length > 0
            ? message.subject
            : "(no subject)"}
        </h1>
        <p className="mt-1 text-muted-foreground">
          Received by {bundle.client.name} — any authorised operator on this
          client can reply from the connected mailbox that received it.
        </p>
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Message</CardTitle>
            {handling.handledAt ? (
              <Badge variant="secondary" className="font-normal">
                Handled {formatDateTime(new Date(handling.handledAt))}
              </Badge>
            ) : (
              <Badge variant="outline" className="font-normal">
                Unhandled
              </Badge>
            )}
            <Badge variant="outline" className="font-normal">
              {mailbox.provider}
            </Badge>
          </div>
          <CardDescription>
            Conversation snapshot stored by the inbox sync. Full bodies
            are fetched on demand and cached here for this workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
            <dt className="text-muted-foreground">From</dt>
            <dd className="font-medium break-all">{message.fromEmail}</dd>
            <dt className="text-muted-foreground">Received at</dt>
            <dd>{formatDateTime(message.receivedAt)}</dd>
            <dt className="text-muted-foreground">Mailbox</dt>
            <dd className="break-all">
              {mailbox.displayName
                ? `${mailbox.displayName} <${mailbox.email}>`
                : mailbox.email}
              {mailbox.connectionStatus !== "CONNECTED" ? (
                <span className="ml-2 text-xs text-destructive">
                  ({mailbox.connectionStatus})
                </span>
              ) : null}
            </dd>
            <dt className="text-muted-foreground">To</dt>
            <dd className="break-all">{message.toEmail ?? "—"}</dd>
            <dt className="text-muted-foreground">Subject</dt>
            <dd className="break-words">{message.subject ?? "(no subject)"}</dd>
            {message.conversationId ? (
              <>
                <dt className="text-muted-foreground">Thread</dt>
                <dd className="font-mono text-xs break-all">
                  {message.conversationId}
                </dd>
              </>
            ) : null}
          </dl>

          <InboundMessageFullBody
            clientId={clientId}
            inboundMessageId={message.id}
            bodyText={message.bodyText ?? null}
            bodyContentType={message.bodyContentType ?? null}
            fullBodySize={message.fullBodySize ?? null}
            fullBodySource={message.fullBodySource ?? null}
            fullBodyFetchedAt={
              message.fullBodyFetchedAt
                ? new Date(message.fullBodyFetchedAt).toISOString()
                : null
            }
            bodyPreview={message.bodyPreview ?? null}
            snippet={message.snippet ?? null}
            mailboxEmail={mailbox.email}
            provider={mailbox.provider}
          />

          {linkedReply ? (
            <p className="rounded-md border border-border/70 bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
              Linked InboundReply{" "}
              <span className="font-mono">{linkedReply.id}</span> ·{" "}
              match: {linkedReply.matchMethod}
              {linkedReply.linkedOutboundEmailId
                ? ` · reply to OutboundEmail ${linkedReply.linkedOutboundEmailId}`
                : ""}
              .
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Reply</CardTitle>
          <CardDescription>
            Reply from {mailbox.email}. Replies thread against the original
            conversation (Microsoft Graph reply endpoint / Gmail threadId)
            and count against the mailbox daily send cap.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mailbox.provider !== "MICROSOFT" && mailbox.provider !== "GOOGLE" ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              Replies are only supported on Microsoft 365 and Google Workspace
              mailboxes. This mailbox is {mailbox.provider}.
            </p>
          ) : (
            <InboundMessageReplyForm
              clientId={clientId}
              inboundMessageId={message.id}
              replyToEmail={message.fromEmail}
              replySubject={replySubject}
              fromMailboxEmail={mailbox.email}
              canSend={canSend}
              canSendReason={canSendReason}
              alreadyHandled={handling.handledAt !== null}
            />
          )}
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Reply history</CardTitle>
          <CardDescription>
            Outbound replies sent from ODoutreach for this inbound message.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {replyHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No replies sent yet from this workspace.
            </p>
          ) : (
            <ol className="space-y-2">
              {replyHistory.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border/70 bg-card px-3 py-2 text-sm"
                >
                  <Badge
                    variant={r.status === "SENT" ? "default" : "outline"}
                    className="font-normal"
                  >
                    {r.status}
                  </Badge>
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatDateTime(r.sentAt ?? r.createdAt)}
                  </span>
                  <span className="break-all">→ {r.toEmail}</span>
                  <span className="text-muted-foreground break-words">
                    {r.subject ?? "(no subject)"}
                  </span>
                  <Link
                    href={`/activity/outbound/${r.id}`}
                    className="ml-auto text-xs underline-offset-4 hover:underline"
                  >
                    Open
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
