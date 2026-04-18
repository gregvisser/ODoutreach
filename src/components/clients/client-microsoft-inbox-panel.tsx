"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { format } from "date-fns";

import { syncMicrosoftInboxForMailboxAction } from "@/app/(app)/clients/mailbox-inbox-actions";
import { Button } from "@/components/ui/button";
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
  mailbox: { id: string; email: string; displayName: string | null };
};

type Mbox = { id: string; email: string; label: string };

type Props = {
  clientId: string;
  messages: Row[];
  microsoftMailboxes: Mbox[];
  canSync: boolean;
  oauthMicrosoftReady: boolean;
};

export function ClientMicrosoftInboxPanel({
  clientId,
  messages,
  microsoftMailboxes,
  canSync,
  oauthMicrosoftReady,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [key, setKey] = useState(0);
  const [message, setMessage] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  const onSync = (mailboxId: string) => {
    if (!canSync) return;
    setMessage(null);
    setKey((k) => k + 1);
    startTransition(async () => {
      const r = await syncMicrosoftInboxForMailboxAction(clientId, mailboxId);
      if (r.ok) {
        setMessage({
          type: "ok",
          text: `Fetched and stored ${r.ingested} of ${r.totalSeen} message(s) from Microsoft.`,
        });
        router.refresh();
      } else {
        setMessage({ type: "err", text: r.error });
      }
    });
  };

  if (!oauthMicrosoftReady) {
    return (
      <p className="text-sm text-muted-foreground">
        Set mailbox Microsoft OAuth (MAILBOX_MICROSOFT_*) in the app environment to enable inbox
        read.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Inbox is read with Microsoft <span className="text-foreground">Mail.Read</span> on the
        connected mailbox. Run <strong>Fetch recent</strong> to pull the latest from Graph (tokens
        stay on the server). New scopes require reconnecting the mailbox once to consent.
      </p>

      {microsoftMailboxes.length === 0 && (
        <p className="text-sm text-muted-foreground">No Microsoft mailbox is connected for this client.</p>
      )}

      {microsoftMailboxes.length > 0 && (
        <div className="flex flex-wrap gap-2" key={key}>
          {microsoftMailboxes.map((m) => (
            <div key={m.id} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground sm:hidden">Fetch</span>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={!canSync || pending}
                onClick={() => onSync(m.id)}
                title={m.label}
              >
                Fetch recent — {m.label}
              </Button>
            </div>
          ))}
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
          No ingested messages yet. Fetch recent from a connected Microsoft mailbox to populate this
          list.
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
                    {m.bodyPreview
                      ? m.bodyPreview.length > 220
                        ? `${m.bodyPreview.slice(0, 220)}…`
                        : m.bodyPreview
                      : "—"}
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
