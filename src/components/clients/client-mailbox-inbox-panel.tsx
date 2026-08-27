"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { format } from "date-fns";

import { syncMailboxInboxForMailboxAction } from "@/app/(app)/clients/mailbox-inbox-actions";
import { Button } from "@/components/ui/button";
import {
  formatMailboxLastChecked,
  replySyncButtonLabel,
} from "@/lib/inbox/reply-sync-copy";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Row = {
  id: string;
  fromEmail: string;
  toEmail: string | null;
  subject: string | null;
  bodyPreview: string | null;
  receivedAt: string;
  conversationId: string | null;
  hasFullBody?: boolean;
  mailbox: { id: string; email: string; displayName: string | null };
};

type Mbox = {
  id: string;
  email: string;
  label: string;
  provider: "MICROSOFT" | "GOOGLE";
  lastSyncAt: string | null;
};

type Props = {
  clientId: string;
  messages: Row[];
  connectedMailboxes: Mbox[];
  canSync: boolean;
  oauthMicrosoftReady: boolean;
  oauthGoogleReady: boolean;
};

export function ClientMailboxInboxPanel({
  clientId,
  messages,
  connectedMailboxes,
  canSync,
  oauthMicrosoftReady,
  oauthGoogleReady,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [key, setKey] = useState(0);
  const [message, setMessage] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  const onSync = (mailboxId: string, provider: Mbox["provider"]) => {
    if (!canSync) return;
    const oauthOk = provider === "GOOGLE" ? oauthGoogleReady : oauthMicrosoftReady;
    if (!oauthOk) return;
    setMessage(null);
    setKey((k) => k + 1);
    startTransition(async () => {
      const r = await syncMailboxInboxForMailboxAction(clientId, mailboxId);
      if (r.ok) {
        setMessage({
          type: "ok",
          text: `Checked replies and stored ${r.ingested} of ${r.totalSeen} recent message(s).`,
        });
        router.refresh();
      } else {
        setMessage({ type: "err", text: r.error });
      }
    });
  };

  const oauthHint = () => {
    if (!oauthMicrosoftReady && !oauthGoogleReady) {
      return (
        <p className="text-sm text-muted-foreground">
          Microsoft / Google mailbox access isn&apos;t set up yet — ask an
          administrator to finish the one-time connection so replies can be read.
        </p>
      );
    }
    return (
      <p className="text-sm text-muted-foreground">
        Replies are checked by reading each connected mailbox (
        <span className="text-foreground">Microsoft Mail.Read</span> or{" "}
        <span className="text-foreground">Gmail readonly</span>). Click{" "}
        <strong>Check for replies</strong> to pull the latest messages into Activity.
      </p>
    );
  };

  return (
    <div className="space-y-4">
      {oauthHint()}

      {connectedMailboxes.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No connected mailbox is available for this client. Connect Microsoft 365 or Google
          Workspace above.
        </p>
      )}

      {connectedMailboxes.length > 0 && (
        <div className="flex flex-wrap gap-2" key={key}>
          {connectedMailboxes.map((m) => {
            const oauthOk = m.provider === "GOOGLE" ? oauthGoogleReady : oauthMicrosoftReady;
            return (
              <div key={m.id} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground sm:hidden">Check</span>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={!canSync || pending || !oauthOk}
                  onClick={() => onSync(m.id, m.provider)}
                  title={m.label}
                >
                  {replySyncButtonLabel(m)}
                </Button>
                <span className="text-xs text-muted-foreground">
                  Last checked: {formatMailboxLastChecked(m.lastSyncAt)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {message && (
        <p
          className={
            message.type === "ok"
              ? "rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
              : "rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          }
        >
          {message.text}
        </p>
      )}

      {messages.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No replies received yet. Click Check for replies to sync connected mailboxes.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Received (UTC)</TableHead>
                <TableHead>Mailbox</TableHead>
                <TableHead>From</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead className="max-w-[min(20rem,40vw)]">Preview</TableHead>
                <TableHead className="w-16 text-right">Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {messages.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {format(new Date(m.receivedAt), "yyyy-MM-dd HH:mm")}
                  </TableCell>
                  <TableCell className="max-w-[8rem] truncate text-xs" title={m.mailbox.email}>
                    {m.mailbox.email}
                  </TableCell>
                  <TableCell className="max-w-[8rem] truncate text-xs" title={m.fromEmail}>
                    {m.fromEmail}
                  </TableCell>
                  <TableCell className="max-w-[10rem] truncate text-xs" title={m.subject ?? "—"}>
                    {m.subject || "—"}
                  </TableCell>
                  <TableCell
                    className="max-w-[min(20rem,40vw)] whitespace-normal break-words text-xs text-muted-foreground"
                    title={m.bodyPreview ?? undefined}
                  >
                    <span
                      className={
                        m.hasFullBody
                          ? "mr-1 inline-flex rounded border border-emerald-300 bg-emerald-50 px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-800"
                          : "mr-1 inline-flex rounded border border-muted-foreground/30 bg-muted/30 px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                      }
                      title={
                        m.hasFullBody
                          ? "Full body has been fetched and cached for this message."
                          : "Only a preview is cached. Open the message to fetch the full body."
                      }
                    >
                      {m.hasFullBody ? "Full" : "Preview"}
                    </span>
                    {m.bodyPreview
                      ? m.bodyPreview.length > 220
                        ? `${m.bodyPreview.slice(0, 220)}…`
                        : m.bodyPreview
                      : "—"}
                  </TableCell>
                  <TableCell className="w-16 text-right">
                    <Link prefetch={false}
                      href={`/clients/${clientId}/activity/messages/${m.id}`}
                      className="text-xs underline-offset-4 hover:underline"
                    >
                      Read →
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
