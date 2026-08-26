"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import {
  sendInternalProofAction,
  type InternalProofSendActionResult,
} from "@/app/(app)/clients/internal-proof-send-actions";
import {
  APPROVED_INTERNAL_PROOF_RECIPIENTS,
  INTERNAL_PROOF_CONFIRMATION_PHRASE,
} from "@/lib/mailboxes/internal-proof-send";
import { buildSenderSignatureViewModel } from "@/lib/mailboxes/sender-signature";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import type { MailboxIdentityRow } from "./client-mailbox-identities-panel";
import type { MailboxSendingReadiness } from "@/server/queries/mailbox-sending-readiness";

type Props = {
  clientId: string;
  rows: MailboxIdentityRow[];
  canMutate: boolean;
  oauthMicrosoftConfigured: boolean;
  oauthGoogleConfigured: boolean;
  sendingReadinessByMailboxId: Record<string, MailboxSendingReadiness | undefined>;
};

function providerReady(
  row: MailboxIdentityRow,
  oauthMicrosoftConfigured: boolean,
  oauthGoogleConfigured: boolean,
): boolean {
  return row.provider === "MICROSOFT" ? oauthMicrosoftConfigured : oauthGoogleConfigured;
}

function signatureReady(row: MailboxIdentityRow): boolean {
  return buildSenderSignatureViewModel(row, {
    senderDisplayNameFallback: null,
    emailSignatureFallback: null,
  }).hasMailboxSignature;
}

function resultText(r: InternalProofSendActionResult): string {
  if (!r.ok) return r.error;
  return r.message;
}

export function InternalProofSendCard({
  clientId,
  rows,
  canMutate,
  oauthMicrosoftConfigured,
  oauthGoogleConfigured,
  sendingReadinessByMailboxId,
}: Props) {
  const router = useRouter();
  const eligibleRows = useMemo(
    () =>
      rows.filter((row) => {
        const readiness = sendingReadinessByMailboxId[row.id];
        return (
          !row.workspaceRemovedAt &&
          row.isActive &&
          row.connectionStatus === "CONNECTED" &&
          row.canSend &&
          row.isSendingEnabled &&
          providerReady(row, oauthMicrosoftConfigured, oauthGoogleConfigured) &&
          signatureReady(row) &&
          readiness?.eligible === true &&
          (readiness.remaining ?? 0) > 0
        );
      }),
    [oauthGoogleConfigured, oauthMicrosoftConfigured, rows, sendingReadinessByMailboxId],
  );

  const [mailboxId, setMailboxId] = useState(eligibleRows[0]?.id ?? "");
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const selected = eligibleRows.find((row) => row.id === mailboxId) ?? null;
  const canSubmit =
    canMutate &&
    !!selected &&
    !!recipient &&
    subject.trim().length > 0 &&
    bodyText.trim().length > 0 &&
    confirmation.trim() === INTERNAL_PROOF_CONFIRMATION_PHRASE &&
    !pending;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (!canSubmit) {
      setMessage({
        type: "err",
        text: `Choose a ready mailbox, complete the fields, and type ${INTERNAL_PROOF_CONFIRMATION_PHRASE}.`,
      });
      return;
    }
    startTransition(async () => {
      const result = await sendInternalProofAction(clientId, {
        mailboxIdentityId: mailboxId,
        toEmail: recipient,
        subject,
        bodyText,
        confirmationPhrase: confirmation,
      });
      setMessage({ type: result.ok ? "ok" : "err", text: resultText(result) });
      if (result.ok) {
        setConfirmation("");
        router.refresh();
      }
    });
  };

  return (
    <section className="rounded-lg border border-border/80 bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Mailbox verification
        </p>
        <h2 className="text-lg font-semibold tracking-tight">Send a verification email</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Sends exactly one internal verification email from the selected connected mailbox
          to confirm it can deliver. It reserves one daily slot for that mailbox, appends that
          mailbox&apos;s saved signature and unsubscribe footer, and appears in Activity and
          recent send logs.
        </p>
      </div>

      {!canMutate ? (
        <p className="mt-4 text-sm text-muted-foreground">
          You do not have permission to send mailbox verification emails for this workspace.
        </p>
      ) : eligibleRows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No mailbox is currently eligible for a verification send. Check that a mailbox
          is connected, its sign-in has not expired, its signature is set, and it still
          has daily capacity left.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="internal-proof-mailbox">Sending mailbox</Label>
            <select
              id="internal-proof-mailbox"
              value={mailboxId}
              onChange={(e) => setMailboxId(e.target.value)}
              className="h-8 w-full max-w-xl rounded-lg border border-input bg-background px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {eligibleRows.map((row) => {
                const readiness = sendingReadinessByMailboxId[row.id];
                return (
                  <option key={row.id} value={row.id}>
                    {row.email} — {String(readiness?.remaining ?? 0)} remaining today
                  </option>
                );
              })}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="internal-proof-recipient">Recipient</Label>
            <select
              id="internal-proof-recipient"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="h-8 w-full max-w-xl rounded-lg border border-input bg-background px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {APPROVED_INTERNAL_PROOF_RECIPIENTS.map((email) => (
                <option key={email} value={email}>
                  {email}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2 lg:col-span-2">
            <Label htmlFor="internal-proof-subject">Subject</Label>
            <Input
              id="internal-proof-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="ODoutreach mailbox verification — mailbox — timestamp"
            />
          </div>
          <div className="space-y-2 lg:col-span-2">
            <Label htmlFor="internal-proof-body">Body</Label>
            <Textarea
              id="internal-proof-body"
              rows={7}
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              placeholder="This is an ODoutreach internal mailbox verification email."
            />
            <p className="text-xs text-muted-foreground">
              Do not paste a signature or unsubscribe footer here; the selected mailbox&apos;s
              saved signature and compliance footer are appended by the send pipeline.
            </p>
          </div>
          <div className="space-y-2 lg:col-span-2">
            <Label htmlFor="internal-proof-confirm">
              Confirmation: type <code>{INTERNAL_PROOF_CONFIRMATION_PHRASE}</code>
            </Label>
            <Input
              id="internal-proof-confirm"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="off"
              className="max-w-md font-mono"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 lg:col-span-2">
            <Button type="submit" disabled={!canSubmit}>
              {pending ? "Sending..." : "Send verification email"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Server-side guard accepts only the listed recipients and exactly one selected mailbox.
            </p>
          </div>
          {message ? (
            <p
              role="status"
              className={
                message.type === "ok"
                  ? "text-sm font-medium text-emerald-700 dark:text-emerald-400 lg:col-span-2"
                  : "text-sm font-medium text-destructive lg:col-span-2"
              }
            >
              {message.text}
            </p>
          ) : null}
        </form>
      )}
    </section>
  );
}
