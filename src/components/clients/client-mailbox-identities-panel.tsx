"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { format } from "date-fns";

import {
  disconnectMailboxIdentity,
  prepareMailboxOAuthConnection,
} from "@/app/(app)/clients/mailbox-connection-actions";
import {
  createClientMailboxIdentity,
  setClientMailboxPrimary,
  updateClientMailboxIdentity,
  type MailboxActionResult as IdentityActionResult,
} from "@/app/(app)/clients/mailbox-identities-actions";
import {
  syncMailboxSignatureAction,
  updateMailboxSignatureAction,
  type MailboxSignatureActionResult,
} from "@/app/(app)/clients/mailbox-signature-actions";
import {
  buildSenderSignatureViewModel,
  SENDER_SIGNATURE_STATUS,
  type SenderSignatureClientBriefFallback,
  type SenderSignatureSource,
} from "@/lib/mailboxes/sender-signature";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  DEFAULT_MAILBOX_DAILY_SEND_CAP,
  isMailboxSendingEligible,
  MAX_ACTIVE_MAILBOXES_PER_CLIENT,
} from "@/lib/mailbox-identities";

export type MailboxIdentityRow = {
  id: string;
  email: string;
  displayName: string | null;
  provider: "MICROSOFT" | "GOOGLE";
  connectionStatus:
    | "DRAFT"
    | "PENDING_CONNECTION"
    | "CONNECTED"
    | "CONNECTION_ERROR"
    | "DISCONNECTED";
  providerLinkedUserId: string | null;
  connectedAt: string | null;
  isActive: boolean;
  isPrimary: boolean;
  canSend: boolean;
  canReceive: boolean;
  dailySendCap: number;
  isSendingEnabled: boolean;
  emailsSentToday: number;
  dailyWindowResetAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  updatedAt: string;
  senderDisplayName: string | null;
  senderSignatureHtml: string | null;
  senderSignatureText: string | null;
  senderSignatureSource: string | null;
  senderSignatureSyncedAt: string | null;
  senderSignatureSyncError: string | null;
};

const SIGNATURE_BADGE_CLASSES: Record<SenderSignatureSource, string> = {
  gmail_send_as:
    "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
  manual: "bg-blue-500/15 text-blue-800 dark:text-blue-200",
  client_brief_fallback:
    "bg-amber-500/15 text-amber-800 dark:text-amber-200",
  unsupported_provider:
    "bg-muted text-muted-foreground",
  missing: "bg-destructive/15 text-destructive",
};

function notify(
  result: IdentityActionResult,
  ok: (m: string) => void,
  err: (m: string) => void,
) {
  if (result.ok) ok("Saved.");
  else err(result.error);
}

const PROVIDERS = [
  { value: "MICROSOFT", label: "Microsoft 365" },
  { value: "GOOGLE", label: "Google Workspace" },
] as const;

const STATUSES = [
  { value: "DRAFT", label: "Draft" },
  { value: "PENDING_CONNECTION", label: "Pending connection" },
  { value: "CONNECTED", label: "Connected" },
  { value: "CONNECTION_ERROR", label: "Connection error" },
  { value: "DISCONNECTED", label: "Disconnected" },
] as const;

function oauthReadyForRow(
  row: MailboxIdentityRow,
  oauthMicrosoftConfigured: boolean,
  oauthGoogleConfigured: boolean,
): boolean {
  return row.provider === "MICROSOFT"
    ? oauthMicrosoftConfigured
    : oauthGoogleConfigured;
}

function providerConnectionHint(
  row: MailboxIdentityRow,
  oauthOk: boolean,
): string {
  if (!oauthOk) {
    return "This provider isn't connected yet. Ask an administrator to finish setup in Settings.";
  }
  switch (row.connectionStatus) {
    case "DRAFT":
      return "Not connected yet — use Connect to sign in with Microsoft or Google.";
    case "PENDING_CONNECTION":
      return "Finish sign-in in the provider window, or press Connect again.";
    case "CONNECTED":
      return row.connectedAt
        ? `Connected ${format(new Date(row.connectedAt), "d MMM yyyy, HH:mm")}`
        : "Connected.";
    case "CONNECTION_ERROR":
      return "Sign-in didn't complete. Check the last error below and reconnect.";
    case "DISCONNECTED":
      return "Disconnected — use Connect to sign in again.";
    default:
      return "";
  }
}

export type MailboxLedgerReadiness = {
  bookedInUtcDay: number;
  cap: number;
  remaining: number;
  eligible: boolean;
  ineligibleCode: string | null;
  atLedgerCap: boolean;
};

function ineligibleCodeToMessage(code: string | null): string {
  if (!code) return "Not ready to send";
  switch (code) {
    case "inactive_mailbox":
      return "Mailbox is paused";
    case "mailbox_not_connected":
      return "Not connected";
    case "sending_not_allowed_for_mailbox":
      return "Sending turned off for this mailbox";
    case "sending_disabled":
      return "Sending paused by an operator";
    case "daily_send_cap_reached_stale_counter":
      return "Daily limit may be reached";
    case "daily_ledger_cap_reached":
      return "Daily limit reached for today";
    default:
      return "Not ready to send";
  }
}

function eligibilityLabel(
  row: MailboxIdentityRow,
  now: Date,
  ledger: MailboxLedgerReadiness | undefined,
) {
  if (ledger) {
    if (ledger.eligible) {
      return "Ready to send today";
    }
    return ineligibleCodeToMessage(ledger.ineligibleCode);
  }
  const eligible = isMailboxSendingEligible(
    {
      isActive: row.isActive,
      connectionStatus: row.connectionStatus,
      canSend: row.canSend,
      isSendingEnabled: row.isSendingEnabled,
      dailySendCap: row.dailySendCap,
      emailsSentToday: row.emailsSentToday,
      dailyWindowResetAt: row.dailyWindowResetAt
        ? new Date(row.dailyWindowResetAt)
        : null,
    },
    now,
  );
  return eligible ? "Ready to send today" : "Not ready to send";
}

export function ClientMailboxIdentitiesPanel({
  clientId,
  rows,
  canMutate,
  oauthMicrosoftConfigured,
  oauthGoogleConfigured,
  mailboxOAuthBanner,
  sendingReadinessByMailboxId,
  clientBriefFallback,
}: {
  clientId: string;
  rows: MailboxIdentityRow[];
  canMutate: boolean;
  oauthMicrosoftConfigured: boolean;
  oauthGoogleConfigured: boolean;
  mailboxOAuthBanner: { type: "ok" | "err"; text: string } | null;
  /** When the workspace has mailbox rows, the server provides UTC-day ledger counts. */
  sendingReadinessByMailboxId?: Record<string, MailboxLedgerReadiness>;
  clientBriefFallback: SenderSignatureClientBriefFallback;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );
  const [addOpen, setAddOpen] = useState(false);
  const [editRow, setEditRow] = useState<MailboxIdentityRow | null>(null);
  const [signatureEditRow, setSignatureEditRow] =
    useState<MailboxIdentityRow | null>(null);

  const now = useMemo(() => new Date(), []);
  const activeCount = rows.filter((r) => r.isActive).length;

  const run = (action: () => Promise<IdentityActionResult>) => {
    startTransition(async () => {
      const r = await action();
      notify(
        r,
        (m) => {
          setBanner({ type: "ok", text: m });
          router.refresh();
        },
        (m) => setBanner({ type: "err", text: m }),
      );
    });
  };

  const startOAuth = (mailboxId: string) => {
    startTransition(async () => {
      const r = await prepareMailboxOAuthConnection(clientId, mailboxId);
      if (!r.ok) {
        setBanner({ type: "err", text: r.error });
        router.refresh();
        return;
      }
      window.location.href = r.startUrl;
    });
  };

  const runSignature = (action: () => Promise<MailboxSignatureActionResult>) => {
    startTransition(async () => {
      const r = await action();
      if (r.ok) {
        setBanner({ type: "ok", text: r.message });
        router.refresh();
      } else {
        setBanner({ type: "err", text: r.error });
      }
    });
  };

  const runDisconnect = (mailboxId: string) => {
    startTransition(async () => {
      const r = await disconnectMailboxIdentity(clientId, mailboxId);
      if (!r.ok) {
        setBanner({ type: "err", text: r.error });
        return;
      }
      setBanner({ type: "ok", text: "Mailbox disconnected." });
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      {mailboxOAuthBanner ? (
        <div
          role="status"
          className={cn(
            "rounded-md border px-3 py-2 text-sm",
            mailboxOAuthBanner.type === "ok"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100"
              : "border-destructive/40 bg-destructive/10 text-destructive",
          )}
        >
          {mailboxOAuthBanner.text}
        </div>
      ) : null}
      {banner && (
        <div
          role="status"
          className={cn(
            "rounded-md border px-3 py-2 text-sm",
            banner.type === "ok"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100"
              : "border-destructive/40 bg-destructive/10 text-destructive",
          )}
        >
          {banner.text}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Active mailboxes:{" "}
          <span className="font-medium text-foreground">
            {activeCount}/{MAX_ACTIVE_MAILBOXES_PER_CLIENT}
          </span>
          . Each mailbox sends up to{" "}
          <span className="font-medium text-foreground">
            {DEFAULT_MAILBOX_DAILY_SEND_CAP}/day
          </span>
          . Daily totals reset each day and reconcile with real send outcomes.
        </p>
        {canMutate ? (
          <Sheet open={addOpen} onOpenChange={setAddOpen}>
            <SheetTrigger
              className={cn(buttonVariants({ size: "sm" }), pending && "pointer-events-none opacity-60")}
            >
              Add mailbox
            </SheetTrigger>
            <SheetContent side="right" className="w-full max-w-md sm:max-w-lg">
              <MailboxForm
                variant="create"
                title="Add a mailbox"
                description="Enter the sender address and provider. After saving, press Connect to sign in with Microsoft or Google."
                submitLabel="Save"
                clientId={clientId}
                disabled={pending}
                onSubmitCreate={(payload) => {
                  run(async () => {
                    const r = await createClientMailboxIdentity(payload);
                    if (r.ok) setAddOpen(false);
                    return r;
                  });
                }}
              />
            </SheetContent>
          </Sheet>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border/80">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mailbox</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Connection</TableHead>
              <TableHead>Sending</TableHead>
              <TableHead className="text-right">Sent today / cap</TableHead>
              <TableHead className="min-w-[220px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  No mailboxes connected yet. Add up to five sending mailboxes
                  — one per sender, using Microsoft 365 or Google Workspace.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const ledger = sendingReadinessByMailboxId?.[row.id];
                const oauthOk = oauthReadyForRow(
                  row,
                  oauthMicrosoftConfigured,
                  oauthGoogleConfigured,
                );
                return (
                  <TableRow key={row.id}>
                    <TableCell className="align-top">
                      <div className="font-medium">{row.email}</div>
                      {row.displayName ? (
                        <div className="text-xs text-muted-foreground">{row.displayName}</div>
                      ) : null}
                      <div className="mt-1 flex flex-wrap gap-1">
                        {row.isPrimary ? (
                          <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-xs font-medium text-primary">
                            Primary
                          </span>
                        ) : null}
                        <span
                          className={cn(
                            "rounded-md px-1.5 py-0.5 text-xs font-medium",
                            row.isActive
                              ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {row.isActive ? "Active" : "Inactive"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="align-top text-sm">
                      {PROVIDERS.find((p) => p.value === row.provider)?.label ?? row.provider}
                    </TableCell>
                    <TableCell className="align-top text-sm">
                      <div className="font-medium">
                        {STATUSES.find((s) => s.value === row.connectionStatus)?.label ??
                          row.connectionStatus}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {providerConnectionHint(row, oauthOk)}
                      </div>
                      {row.providerLinkedUserId ? (
                        <div className="mt-1 font-mono text-[10px] text-muted-foreground break-all">
                          Provider id: {row.providerLinkedUserId}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="align-top text-xs text-muted-foreground max-w-[240px]">
                      {eligibilityLabel(row, now, ledger)}
                      {!row.isSendingEnabled ? (
                        <span className="mt-1 block text-amber-700 dark:text-amber-300">
                          Sending paused by operator.
                        </span>
                      ) : null}
                      {row.lastError ? (
                        <span className="mt-1 block text-destructive line-clamp-3" title={row.lastError}>
                          {row.lastError}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="align-top text-right text-sm tabular-nums">
                      {ledger ? (
                        <>
                          <div>
                            {ledger.bookedInUtcDay} / {ledger.cap}{" "}
                            <span className="text-muted-foreground">today</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {ledger.remaining} remaining
                          </div>
                        </>
                      ) : (
                        <>
                          {row.emailsSentToday} / {row.dailySendCap}
                          {row.dailyWindowResetAt ? (
                            <div className="text-xs text-muted-foreground">
                              Resets {format(new Date(row.dailyWindowResetAt), "d MMM, HH:mm")}
                            </div>
                          ) : null}
                        </>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex flex-wrap gap-1">
                        {canMutate ? (
                          <>
                            <Button
                              size="xs"
                              variant="outline"
                              disabled={pending || !row.isActive || row.isPrimary}
                              onClick={() =>
                                run(async () => setClientMailboxPrimary(clientId, row.id))
                              }
                            >
                              Set primary
                            </Button>
                            <Button
                              size="xs"
                              variant="outline"
                              disabled={pending}
                              onClick={() => setEditRow(row)}
                            >
                              Edit
                            </Button>
                            <Button
                              size="xs"
                              variant="secondary"
                              disabled={pending || !oauthOk || !row.isActive}
                              title={
                                !oauthOk
                                  ? "Configure mailbox OAuth env vars for this provider"
                                  : undefined
                              }
                              onClick={() => startOAuth(row.id)}
                            >
                              {row.connectionStatus === "CONNECTED" ? "Reconnect" : "Connect"}
                            </Button>
                            <Button
                              size="xs"
                              variant="outline"
                              disabled={pending || row.connectionStatus !== "CONNECTED"}
                              onClick={() => runDisconnect(row.id)}
                            >
                              Disconnect
                            </Button>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">View only</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {rows.length > 0 ? (
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Sender identity</h3>
            <p className="text-xs text-muted-foreground">
              Each mailbox can have its own sender name and email signature.
              Google Workspace mailboxes can pull the signature straight from
              Gmail. Microsoft 365 mailboxes don&rsquo;t expose a signature
              over the API — add one manually instead. If a mailbox has no
              signature of its own, sends fall back to the one on the client
              brief.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {rows.map((row) => {
              const vm = buildSenderSignatureViewModel(
                {
                  provider: row.provider,
                  email: row.email,
                  displayName: row.displayName,
                  senderDisplayName: row.senderDisplayName,
                  senderSignatureHtml: row.senderSignatureHtml,
                  senderSignatureText: row.senderSignatureText,
                  senderSignatureSource: row.senderSignatureSource,
                  senderSignatureSyncedAt: row.senderSignatureSyncedAt,
                  senderSignatureSyncError: row.senderSignatureSyncError,
                },
                clientBriefFallback,
              );
              const badgeClass = SIGNATURE_BADGE_CLASSES[vm.source];
              const badgeLabel = SENDER_SIGNATURE_STATUS[vm.source];
              return (
                <div
                  key={`sig-${row.id}`}
                  className="flex flex-col gap-2 rounded-lg border border-border/80 p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">{row.email}</div>
                      <div className="text-xs text-muted-foreground">
                        {vm.resolvedDisplayName}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "rounded-md px-1.5 py-0.5 text-xs font-medium",
                        badgeClass,
                      )}
                    >
                      {badgeLabel}
                    </span>
                  </div>
                  {vm.resolvedSignatureText ? (
                    <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 px-2 py-1.5 text-xs leading-snug">
                      {vm.resolvedSignatureText}
                    </pre>
                  ) : (
                    <p className="text-xs italic text-muted-foreground">
                      No signature on file for this mailbox or client brief.
                    </p>
                  )}
                  <div className="text-[11px] text-muted-foreground">
                    {vm.lastSyncedAtIso
                      ? `Last synced ${format(new Date(vm.lastSyncedAtIso), "MMM d, yyyy HH:mm")} UTC`
                      : "Never synced."}
                    {row.provider === "MICROSOFT" ? (
                      <span className="mt-1 block">
                        Outlook signature sync is not available through the
                        supported Microsoft Graph mailbox API. Add a manual
                        signature for this mailbox.
                      </span>
                    ) : null}
                  </div>
                  {vm.syncError ? (
                    <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
                      {vm.syncError}
                    </div>
                  ) : null}
                  {canMutate ? (
                    <div className="flex flex-wrap gap-1">
                      {row.provider === "GOOGLE" ? (
                        <Button
                          size="xs"
                          variant="secondary"
                          disabled={
                            pending ||
                            !row.isActive ||
                            row.connectionStatus !== "CONNECTED"
                          }
                          title={
                            row.connectionStatus !== "CONNECTED"
                              ? "Connect this Gmail mailbox first."
                              : undefined
                          }
                          onClick={() =>
                            runSignature(async () =>
                              syncMailboxSignatureAction(clientId, row.id),
                            )
                          }
                        >
                          Sync from Gmail
                        </Button>
                      ) : null}
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={pending}
                        onClick={() => setSignatureEditRow(row)}
                      >
                        Edit manual signature
                      </Button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {canMutate ? (
        <Sheet
          open={signatureEditRow !== null}
          onOpenChange={(o) => {
            if (!o) setSignatureEditRow(null);
          }}
        >
          <SheetContent side="right" className="w-full max-w-md sm:max-w-lg">
            {signatureEditRow ? (
              <MailboxSignatureForm
                key={`sigform-${signatureEditRow.id}`}
                clientId={clientId}
                row={signatureEditRow}
                disabled={pending}
                onSubmit={(payload) => {
                  runSignature(async () => {
                    const r = await updateMailboxSignatureAction(payload);
                    if (r.ok) setSignatureEditRow(null);
                    return r;
                  });
                }}
              />
            ) : null}
          </SheetContent>
        </Sheet>
      ) : null}

      {canMutate ? (
        <Sheet
          open={editRow !== null}
          onOpenChange={(o) => {
            if (!o) setEditRow(null);
          }}
        >
          <SheetContent side="right" className="w-full max-w-md sm:max-w-lg">
            {editRow ? (
              <MailboxForm
                key={editRow.id}
                variant="edit"
                title="Edit mailbox identity"
                description="Email is fixed. Connection status is managed with Connect / Disconnect only."
                submitLabel="Save changes"
                clientId={clientId}
                disabled={pending}
                editRow={editRow}
                onSubmitUpdate={(payload) => {
                  run(async () => {
                    const r = await updateClientMailboxIdentity(payload);
                    if (r.ok) setEditRow(null);
                    return r;
                  });
                }}
              />
            ) : null}
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  );
}

type MailboxFormProps =
  | {
      variant: "create";
      title: string;
      description: string;
      submitLabel: string;
      clientId: string;
      disabled: boolean;
      onSubmitCreate: (payload: Parameters<typeof createClientMailboxIdentity>[0]) => void;
    }
  | {
      variant: "edit";
      title: string;
      description: string;
      submitLabel: string;
      clientId: string;
      disabled: boolean;
      editRow: MailboxIdentityRow;
      onSubmitUpdate: (payload: Parameters<typeof updateClientMailboxIdentity>[0]) => void;
    };

function MailboxForm(props: MailboxFormProps) {
  const {
    title,
    description,
    submitLabel,
    clientId,
    disabled,
  } = props;
  const initial = props.variant === "edit" ? props.editRow : null;

  const [email, setEmail] = useState(initial?.email ?? "");
  const [provider, setProvider] = useState<(typeof PROVIDERS)[number]["value"]>(
    initial?.provider ?? "MICROSOFT",
  );
  const [displayName, setDisplayName] = useState(initial?.displayName ?? "");
  const [canSend, setCanSend] = useState(initial?.canSend ?? true);
  const [canReceive, setCanReceive] = useState(initial?.canReceive ?? true);
  const [dailySendCap, setDailySendCap] = useState(
    String(initial?.dailySendCap ?? DEFAULT_MAILBOX_DAILY_SEND_CAP),
  );
  const [isSendingEnabled, setIsSendingEnabled] = useState(
    initial?.isSendingEnabled ?? true,
  );
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [isPrimary, setIsPrimary] = useState(initial?.isPrimary ?? false);
  const [lastError, setLastError] = useState(initial?.lastError ?? "");

  const isEdit = props.variant === "edit";

  return (
    <>
      <SheetHeader>
        <SheetTitle>{title}</SheetTitle>
        <SheetDescription>{description}</SheetDescription>
      </SheetHeader>
      <form
        className="flex flex-col gap-4 px-4 pb-4"
        onSubmit={(e) => {
          e.preventDefault();
          const cap = Number(dailySendCap);
          if (!Number.isFinite(cap) || cap < 1) return;
          if (props.variant === "edit") {
            props.onSubmitUpdate({
              clientId,
              mailboxId: props.editRow.id,
              displayName: displayName.trim() || null,
              canSend,
              canReceive,
              dailySendCap: cap,
              isSendingEnabled,
              isActive,
              isPrimary,
              lastError: lastError.trim() || null,
            });
          } else {
            props.onSubmitCreate({
              clientId,
              email: email.trim(),
              provider,
              displayName: displayName.trim() || null,
              canSend,
              canReceive,
              dailySendCap: cap,
              isSendingEnabled,
              isActive,
              isPrimary,
              lastError: lastError.trim() || null,
            });
          }
        }}
      >
        {!isEdit ? (
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="mb-email">
              Email address
            </label>
            <input
              id="mb-email"
              required
              className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
            />
          </div>
        ) : (
          <div className="rounded-md border border-border/80 bg-muted/40 px-3 py-2 text-sm">
            <div className="text-xs text-muted-foreground">Email (read-only)</div>
            <div className="font-mono text-sm">{props.editRow.email}</div>
          </div>
        )}

        {!isEdit ? (
          <div className="space-y-1.5">
            <span className="text-sm font-medium">Provider</span>
            <select
              className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={provider}
              onChange={(e) =>
                setProvider(e.target.value as (typeof PROVIDERS)[number]["value"])
              }
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="mb-display">
            Display name
          </label>
          <input
            id="mb-display"
            className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Optional"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={canSend}
              onChange={(e) => setCanSend(e.target.checked)}
            />
            Can send
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={canReceive}
              onChange={(e) => setCanReceive(e.target.checked)}
            />
            Can receive
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isSendingEnabled}
              onChange={(e) => setIsSendingEnabled(e.target.checked)}
            />
            Sending enabled
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Active
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
            />
            Primary mailbox (must be active)
          </label>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="mb-cap">
            Daily send cap
          </label>
          <input
            id="mb-cap"
            type="number"
            min={1}
            max={5000}
            className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            value={dailySendCap}
            onChange={(e) => setDailySendCap(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="mb-err">
            Last error (ops)
          </label>
          <textarea
            id="mb-err"
            rows={3}
            className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            value={lastError}
            onChange={(e) => setLastError(e.target.value)}
            placeholder="Optional — surfaced when connection fails"
          />
        </div>

        <SheetFooter className="gap-2 sm:justify-end">
          <SheetClose className={cn(buttonVariants({ variant: "outline" }), "w-full sm:w-auto")}>
            Cancel
          </SheetClose>
          <Button type="submit" disabled={disabled} className="w-full sm:w-auto">
            {submitLabel}
          </Button>
        </SheetFooter>
      </form>
    </>
  );
}

function MailboxSignatureForm(props: {
  clientId: string;
  row: MailboxIdentityRow;
  disabled: boolean;
  onSubmit: (payload: Parameters<typeof updateMailboxSignatureAction>[0]) => void;
}) {
  const { clientId, row, disabled } = props;
  const [senderDisplayName, setSenderDisplayName] = useState(
    row.senderDisplayName ?? row.displayName ?? "",
  );
  const [signatureText, setSignatureText] = useState(row.senderSignatureText ?? "");
  const [signatureHtml, setSignatureHtml] = useState(row.senderSignatureHtml ?? "");
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <>
      <SheetHeader>
        <SheetTitle>Manual sender signature</SheetTitle>
        <SheetDescription>
          Used when composing sends from <strong>{row.email}</strong>. Takes
          precedence over the client brief signature. Plain text is used for
          send bodies today; HTML is stored for future rich sends.
        </SheetDescription>
      </SheetHeader>
      <form
        className="flex flex-col gap-4 px-4 pb-4"
        onSubmit={(e) => {
          e.preventDefault();
          props.onSubmit({
            clientId,
            mailboxId: row.id,
            senderDisplayName: senderDisplayName.trim() || null,
            signatureText: signatureText.trim() || null,
            signatureHtml: signatureHtml.trim() || null,
          });
        }}
      >
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="sig-display">
            Sender display name
          </label>
          <input
            id="sig-display"
            className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            value={senderDisplayName}
            onChange={(e) => setSenderDisplayName(e.target.value)}
            placeholder="e.g. Greg Visser, OpensDoors"
          />
          <p className="text-xs text-muted-foreground">
            Resolves <code>{"{{sender_name}}"}</code> for sends that go through
            this mailbox. Falls back to the workspace name when empty.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="sig-text">
            Signature (plain text)
          </label>
          <textarea
            id="sig-text"
            rows={6}
            className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            value={signatureText}
            onChange={(e) => setSignatureText(e.target.value)}
            placeholder={"e.g.\n--\nGreg Visser\nOpensDoors Outreach\n+44 ..."}
          />
        </div>

        <button
          type="button"
          className="self-start text-xs text-muted-foreground underline"
          onClick={() => setShowAdvanced((s) => !s)}
        >
          {showAdvanced ? "Hide" : "Show"} HTML signature (advanced)
        </button>
        {showAdvanced ? (
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="sig-html">
              Signature (HTML)
            </label>
            <textarea
              id="sig-html"
              rows={6}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={signatureHtml}
              onChange={(e) => setSignatureHtml(e.target.value)}
              placeholder="<div>Greg Visser</div><div>OpensDoors</div>"
            />
            <p className="text-xs text-muted-foreground">
              Stored for future HTML send path. Current sends use the plain
              text rendering derived from this value when the plain text
              field above is empty.
            </p>
          </div>
        ) : null}

        <SheetFooter className="gap-2 sm:justify-end">
          <SheetClose className={cn(buttonVariants({ variant: "outline" }), "w-full sm:w-auto")}>
            Cancel
          </SheetClose>
          <Button type="submit" disabled={disabled} className="w-full sm:w-auto">
            Save manual signature
          </Button>
        </SheetFooter>
      </form>
    </>
  );
}
