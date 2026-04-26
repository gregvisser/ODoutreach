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
  removeClientMailboxFromWorkspace,
  restoreClientMailboxToWorkspace,
  setClientMailboxPrimary,
  updateClientMailboxIdentity,
  type MailboxActionResult as IdentityActionResult,
} from "@/app/(app)/clients/mailbox-identities-actions";
import {
  syncMailboxSignatureAction,
  updateMailboxSignatureAction,
  type MailboxSignatureActionResult,
} from "@/app/(app)/clients/mailbox-signature-actions";
import { SenderReadinessPanel } from "@/components/ops/sender-readiness-panel";
import { buildMailboxSignatureSendPreview } from "@/lib/mailboxes/mailbox-signature-send-preview";
import {
  buildSenderSignatureViewModel,
  chooseSignatureForSend,
  type SenderSignatureClientBriefFallback,
} from "@/lib/mailboxes/sender-signature";
import {
  getOperatorSignatureState,
  humanizeSignatureSource,
} from "@/lib/mailboxes/signature-operator-state";
import {
  computePoolDailyMax,
  countConnectedMailboxes,
  countMailboxNeedsAttention,
  mailboxesWhatToDoNext,
  mailboxRowOperatorStatus,
  MAX_CONNECTED_MAILBOXES,
} from "@/lib/mailboxes/mailboxes-operator-model";
import type { SenderReadinessReport } from "@/lib/sender-readiness";
import { Textarea } from "@/components/ui/textarea";
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
} from "@/lib/mailbox-identities";
import type { SenderSignatureMailbox } from "@/lib/mailboxes/sender-signature";

function toSenderMailbox(row: MailboxIdentityRow): SenderSignatureMailbox {
  return {
    provider: row.provider,
    email: row.email,
    displayName: row.displayName,
    senderDisplayName: row.senderDisplayName,
    senderSignatureHtml: row.senderSignatureHtml,
    senderSignatureText: row.senderSignatureText,
    senderSignatureSource: row.senderSignatureSource,
    senderSignatureSyncedAt: row.senderSignatureSyncedAt,
    senderSignatureSyncError: row.senderSignatureSyncError,
  };
}

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
  /** ISO — when set, the address is archived for this workspace and must not send or sync. */
  workspaceRemovedAt: string | null;
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

function oauthReadyForRow(
  row: MailboxIdentityRow,
  oauthMicrosoftConfigured: boolean,
  oauthGoogleConfigured: boolean,
): boolean {
  return row.provider === "MICROSOFT"
    ? oauthMicrosoftConfigured
    : oauthGoogleConfigured;
}

function connectActionLabel(row: MailboxIdentityRow): string {
  if (row.connectionStatus === "CONNECTED") {
    return "Reconnect";
  }
  if (row.connectionStatus === "PENDING_CONNECTION") {
    return "Complete sign-in";
  }
  return "Connect";
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
      return "Not connected yet — use Connect so an authorised operator can finish provider sign-in for this workspace mailbox.";
    case "PENDING_CONNECTION":
      return "Finish sign-in in the provider window, or press Connect again.";
    case "CONNECTED":
      return row.connectedAt
        ? `Connected ${format(new Date(row.connectedAt), "d MMM yyyy, HH:mm")}`
        : "Connected.";
    case "CONNECTION_ERROR":
      return "Sign-in didn't complete. Check the last error below and reconnect.";
    case "DISCONNECTED":
      return "Disconnected — use Connect to run provider sign-in again (Microsoft delegate or the Gmail user for this row).";
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
    case "mailbox_removed_from_workspace":
      return "Removed from workspace";
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
      workspaceRemovedAt: row.workspaceRemovedAt
        ? new Date(row.workspaceRemovedAt)
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
  senderReport,
  aggregateRemaining,
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
  senderReport: SenderReadinessReport;
  /** Sum of remaining send slots (UTC day) across ledgers — from workspace bundle. */
  aggregateRemaining: number;
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
  const [previewRow, setPreviewRow] = useState<MailboxIdentityRow | null>(null);
  const [showRemoved, setShowRemoved] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<MailboxIdentityRow | null>(null);
  const [removeNote, setRemoveNote] = useState("");

  const now = useMemo(() => new Date(), []);
  const activeRows = useMemo(
    () => rows.filter((r) => !r.workspaceRemovedAt),
    [rows],
  );
  const removedRows = useMemo(
    () => rows.filter((r) => r.workspaceRemovedAt),
    [rows],
  );
  const signatureViewModels = useMemo(
    () =>
      activeRows.map((row) =>
        buildSenderSignatureViewModel(
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
        ),
      ),
    [activeRows, clientBriefFallback],
  );

  const poolDailyMax = useMemo(
    () => computePoolDailyMax(activeRows, sendingReadinessByMailboxId),
    [activeRows, sendingReadinessByMailboxId],
  );

  const needsAttentionCount = useMemo(
    () =>
      countMailboxNeedsAttention({
        activeRows,
        viewModels: signatureViewModels,
      }),
    [activeRows, signatureViewModels],
  );

  const connectedMailboxCount = useMemo(
    () => countConnectedMailboxes(activeRows),
    [activeRows],
  );

  const whatNext = useMemo(
    () =>
      mailboxesWhatToDoNext({
        activeRowCount: activeRows.length,
        needsAttentionCount,
      }),
    [activeRows.length, needsAttentionCount],
  );

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

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border/80 bg-muted/30 px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground">Connected mailboxes</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
            {connectedMailboxCount}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              / {String(MAX_CONNECTED_MAILBOXES)}
            </span>
          </p>
        </div>
        <div className="rounded-lg border border-border/80 bg-muted/30 px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground">Daily capacity (remaining / pool max)</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
            {aggregateRemaining}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              / {String(Math.max(0, poolDailyMax))}
            </span>
          </p>
        </div>
        <div className="rounded-lg border border-border/80 bg-muted/30 px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground">Needs attention</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
            {String(needsAttentionCount)}
          </p>
        </div>
      </div>

      <p className="text-sm text-foreground" role="status">
        {whatNext.message}
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        {canMutate ? (
          <>
            <Sheet open={addOpen} onOpenChange={setAddOpen}>
              <SheetTrigger
                className={cn(
                  buttonVariants({ size: "sm" }),
                  "w-full sm:w-auto",
                  pending && "pointer-events-none opacity-60",
                )}
              >
                Add mailbox
              </SheetTrigger>
              <SheetContent side="right" className="w-full max-w-md sm:max-w-lg">
                <MailboxForm
                  variant="create"
                  title="Add a mailbox"
                  description="Enter the sender address and provider. After saving, press Connect: Microsoft allows a delegate/admin to sign in if they have mailbox access; Google usually needs that mailbox's Google account (unless your Workspace delegation is configured)."
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
            <Sheet
              open={removeTarget !== null}
              onOpenChange={(o) => {
                if (!o) {
                  setRemoveTarget(null);
                  setRemoveNote("");
                }
              }}
            >
              <SheetContent side="right" className="w-full max-w-md sm:max-w-lg">
                <SheetHeader>
                  <SheetTitle>Remove from workspace</SheetTitle>
                  <SheetDescription className="text-left text-sm text-muted-foreground">
                    This address will not be used for future sends, replies, inbox sync, or signature sync.
                    Outbound and inbound history already stored in OpensDoors remains visible.{" "}
                    <span className="text-foreground font-medium">Disconnect</span> only revokes OAuth and
                    keeps the row; removal archives the address until you run Restore.
                  </SheetDescription>
                </SheetHeader>
                {removeTarget ? (
                  <div className="space-y-3 py-2">
                    <p className="text-sm">
                      <span className="font-medium">{removeTarget.email}</span>
                    </p>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground" htmlFor="remove-mailbox-note">
                        Optional note (internal)
                      </label>
                      <Textarea
                        id="remove-mailbox-note"
                        value={removeNote}
                        onChange={(e) => setRemoveNote(e.target.value)}
                        rows={3}
                        disabled={pending}
                      />
                    </div>
                  </div>
                ) : null}
                <SheetFooter className="mt-4 flex flex-row flex-wrap gap-2 sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending}
                    onClick={() => {
                      setRemoveTarget(null);
                      setRemoveNote("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={pending || !removeTarget}
                    onClick={() => {
                      if (!removeTarget) return;
                      const t = removeTarget;
                      run(async () => {
                        const r = await removeClientMailboxFromWorkspace({
                          clientId,
                          mailboxId: t.id,
                          note: removeNote.trim() || null,
                        });
                        if (r.ok) {
                          setRemoveTarget(null);
                          setRemoveNote("");
                        }
                        return r;
                      });
                    }}
                  >
                    Remove from workspace
                  </Button>
                </SheetFooter>
              </SheetContent>
            </Sheet>
          </>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border/80 -mx-1 px-1 sm:mx-0 sm:px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mailbox</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Sent today</TableHead>
              <TableHead>Primary</TableHead>
              <TableHead className="min-w-[12rem]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activeRows.length === 0 ? (
                <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  {removedRows.length > 0
                    ? "No active mailboxes. Restore one under “Show removed mailboxes” or add a new mailbox. History in OpensDoors is kept."
                    : "No mailboxes yet. Add a Microsoft 365 or Google workspace address the client can use for outreach (up to five in this pool)."}
                </TableCell>
              </TableRow>
            ) : (
              activeRows.map((row) => {
                const ledger = sendingReadinessByMailboxId?.[row.id];
                const oauthOk = oauthReadyForRow(
                  row,
                  oauthMicrosoftConfigured,
                  oauthGoogleConfigured,
                );
                const op = mailboxRowOperatorStatus(row);
                return (
                  <TableRow key={row.id}>
                    <TableCell className="align-top min-w-[10rem] max-w-[14rem]">
                      <div className="font-medium break-all">{row.email}</div>
                      {row.displayName ? (
                        <div className="text-xs text-muted-foreground break-words">{row.displayName}</div>
                      ) : null}
                      {row.isActive ? null : (
                        <div className="mt-1 text-xs text-muted-foreground">Paused from pool</div>
                      )}
                    </TableCell>
                    <TableCell className="align-top text-sm whitespace-nowrap">
                      {PROVIDERS.find((p) => p.value === row.provider)?.label ?? row.provider}
                    </TableCell>
                    <TableCell className="align-top text-sm min-w-[10rem] max-w-xs">
                      <div className="font-medium text-foreground">{op.label}</div>
                      {op.sublabel ? (
                        <div className="mt-1 text-xs text-muted-foreground leading-snug">
                          {op.sublabel}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="align-top text-right text-sm tabular-nums whitespace-nowrap">
                      {ledger ? (
                        <span>
                          {ledger.bookedInUtcDay} / {ledger.cap}
                        </span>
                      ) : (
                        <span>
                          {row.emailsSentToday} / {row.dailySendCap}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="align-top text-sm">
                      {row.isPrimary ? (
                        <span
                          className="rounded-md bg-primary/15 px-1.5 py-0.5 text-xs font-medium text-primary"
                          title="Used as the preferred mailbox when a send could use more than one address."
                        >
                          Yes
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex flex-wrap gap-1 max-w-md">
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
                              variant="secondary"
                              disabled={pending || !oauthOk || !row.isActive}
                              title={
                                !oauthOk
                                  ? "The administrator must complete provider sign-in for this app before mailboxes can connect."
                                  : undefined
                              }
                              onClick={() => startOAuth(row.id)}
                            >
                              {connectActionLabel(row)}
                            </Button>
                            <Button
                              size="xs"
                              variant="outline"
                              disabled={pending || row.connectionStatus !== "CONNECTED"}
                              onClick={() => runDisconnect(row.id)}
                            >
                              Disconnect
                            </Button>
                            <Button
                              size="xs"
                              variant="outline"
                              className="text-destructive border-destructive/60"
                              disabled={pending}
                              title="Stops use of this address in the pool. In-app history is kept. Use Disconnect to revoke sign-in only."
                              onClick={() => {
                                setRemoveTarget(row);
                                setRemoveNote("");
                              }}
                            >
                              Remove
                            </Button>
                            <Button
                              size="xs"
                              variant="ghost"
                              className="text-muted-foreground"
                              disabled={pending}
                              onClick={() => setEditRow(row)}
                            >
                              Edit
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

      {removedRows.length > 0 ? (
        <div className="space-y-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-0 text-muted-foreground"
            onClick={() => setShowRemoved((v) => !v)}
          >
            {showRemoved ? "Hide" : "Show"} removed mailboxes ({removedRows.length})
          </Button>
          {showRemoved ? (
            <div className="overflow-x-auto rounded-lg border border-dashed border-border/80">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Removed mailbox</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Removed at</TableHead>
                    <TableHead className="min-w-[180px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {removedRows.map((row) => (
                    <TableRow key={`rm-${row.id}`}>
                      <TableCell>
                        <div className="font-medium">{row.email}</div>
                        <div className="text-xs text-muted-foreground">
                          Not used for new sends, replies, or sync. History in OpensDoors is kept.
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {PROVIDERS.find((p) => p.value === row.provider)?.label ?? row.provider}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.workspaceRemovedAt
                          ? format(new Date(row.workspaceRemovedAt), "d MMM yyyy, HH:mm")
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {canMutate ? (
                          <Button
                            size="xs"
                            variant="secondary"
                            disabled={pending}
                            onClick={() =>
                              run(async () => restoreClientMailboxToWorkspace({ clientId, mailboxId: row.id }))
                            }
                          >
                            Restore to workspace
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">View only</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </div>
      ) : null}

      {activeRows.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Sender signatures</h3>
          <div className="overflow-x-auto rounded-lg border border-border/80 -mx-1 px-1 sm:mx-0 sm:px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mailbox</TableHead>
                  <TableHead>Readiness</TableHead>
                  <TableHead className="min-w-[7rem]">Source</TableHead>
                  <TableHead className="w-[1%] whitespace-nowrap">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeRows.map((row, i) => {
                  const vm = signatureViewModels[i]!;
                  const selection = chooseSignatureForSend({
                    mailbox: toSenderMailbox(row),
                    clientBrief: clientBriefFallback,
                  });
                  const opState = getOperatorSignatureState(row, vm, selection);
                  return (
                    <TableRow key={`sig-${row.id}`}>
                      <TableCell className="align-top text-sm break-all max-w-[14rem] min-w-[8rem]">
                        <div className="font-medium">{row.email}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.connectionStatus === "CONNECTED" ? (
                            <span className="text-emerald-800 dark:text-emerald-200">Connected</span>
                          ) : (
                            <span className="text-amber-800 dark:text-amber-200">Not connected</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {vm.resolvedDisplayName}
                        </div>
                      </TableCell>
                      <TableCell className="align-top text-sm max-w-[12rem]">
                        <div className="font-medium text-foreground leading-snug">
                          {opState.label}
                        </div>
                        {vm.syncError ? (
                          <div
                            className="mt-1 text-xs text-destructive"
                            title={vm.syncError}
                          >
                            Sync error — use Preview or Advanced details to review.
                          </div>
                        ) : null}
                        <div className="mt-1 text-xs text-muted-foreground">
                          {opState.recommendedAction}
                        </div>
                      </TableCell>
                      <TableCell className="align-top text-sm text-muted-foreground">
                        {humanizeSignatureSource(selection.source)}
                      </TableCell>
                      <TableCell className="align-top w-[1%] min-w-[10.5rem]">
                        <div className="flex flex-nowrap justify-end gap-1">
                          <Button
                            type="button"
                            size="xs"
                            variant="secondary"
                            className="shrink-0"
                            disabled={pending}
                            onClick={() => {
                              setPreviewRow(row);
                            }}
                          >
                            Preview signature
                          </Button>
                          {canMutate ? (
                            <>
                              {row.provider === "GOOGLE" ? (
                                <Button
                                  size="xs"
                                  variant="outline"
                                  className="shrink-0"
                                  disabled={
                                    pending ||
                                    !row.isActive ||
                                    row.connectionStatus !== "CONNECTED"
                                  }
                                  title={
                                    row.connectionStatus !== "CONNECTED"
                                      ? "Connect this mailbox first."
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
                                className="shrink-0"
                                disabled={pending}
                                onClick={() => setSignatureEditRow(row)}
                              >
                                Set signature
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <details className="group rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm">
            <summary className="cursor-pointer font-medium text-foreground">
              About signatures
            </summary>
            <div className="mt-2 space-y-2 text-xs text-muted-foreground leading-relaxed">
              <p>
                Gmail: <strong>Sync from Gmail</strong> copies the send-as
                signature from Google. Microsoft 365: you must <strong>set
                the signature in ODoutreach</strong> — Outlook is not read
                automatically. Use <strong>Preview signature</strong> to confirm
                the text and see where the compliant unsubscribe line is
                added (no email is sent in preview). If no mailbox signature
                exists, a short client-level brief may be used as a last-resort
                fallback when the pipeline allows.
              </p>
            </div>
          </details>
          <Sheet
            open={previewRow !== null}
            onOpenChange={(o) => {
              if (!o) setPreviewRow(null);
            }}
          >
            <SheetContent
              side="right"
              className="w-full max-w-md sm:max-w-lg overflow-y-auto"
            >
              {previewRow ? (
                (() => {
                  const mb = toSenderMailbox(previewRow);
                  const pvm = buildSenderSignatureViewModel(mb, clientBriefFallback);
                  const preview = buildMailboxSignatureSendPreview({
                    mailbox: mb,
                    clientBrief: clientBriefFallback,
                  });
                  const pstate = getOperatorSignatureState(
                    previewRow,
                    pvm,
                    preview.selection,
                  );
                    return (
                    <>
                      <SheetHeader>
                        <SheetTitle>Signature preview</SheetTitle>
                        <p className="text-sm text-muted-foreground" role="status">
                          No email was sent.
                        </p>
                        <SheetDescription>
                          {previewRow.email} — {pstate.shortDescription}
                        </SheetDescription>
                      </SheetHeader>
                      <div className="mt-4 space-y-3 px-1 pb-2 text-sm">
                        <p>
                          <span className="font-medium text-foreground">Readiness:</span>{" "}
                          {pstate.label}
                        </p>
                        <p>
                          <span className="font-medium text-foreground">Source:</span>{" "}
                          {humanizeSignatureSource(preview.selection.source)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {preview.footnote}
                        </p>
                        <div>
                          <p className="text-xs font-medium text-foreground">
                            Signature block + compliance footer (plain text)
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            The unsubscribe line is always appended <strong>after</strong> the
                            signature (same order as a real send; sample URL
                            only).
                          </p>
                          <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-border/60 bg-muted/30 p-2 text-xs leading-relaxed text-foreground">
                            {preview.bodyPlain}
                          </pre>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {pstate.recommendedAction}
                        </p>
                      </div>
                      <SheetFooter className="mt-2">
                        <Button
                          type="button"
                          variant="secondary"
                          className="w-full sm:w-auto"
                          onClick={() => setPreviewRow(null)}
                        >
                          Close
                        </Button>
                      </SheetFooter>
                    </>
                  );
                })()
              ) : null}
            </SheetContent>
          </Sheet>
        </div>
      ) : null}

      <details className="rounded-lg border border-dashed border-border/80 bg-muted/10 px-3 py-2 text-sm">
        <summary className="cursor-pointer font-medium text-foreground">
          Advanced details
        </summary>
        <p className="text-xs text-muted-foreground mt-1 mb-3">
          For administrators and troubleshooting. Includes transport notes, internal ids, and
          connection diagnostics.
        </p>
        <SenderReadinessPanel report={senderReport} viewContext="mailboxesClient" />
        <div className="mt-4 space-y-4 text-xs">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Per-mailbox technical
          </p>
          {activeRows.map((row, advIdx) => {
            const ledger = sendingReadinessByMailboxId?.[row.id];
            const oauthOk = oauthReadyForRow(
              row,
              oauthMicrosoftConfigured,
              oauthGoogleConfigured,
            );
            const advVm = signatureViewModels[advIdx]!;
            return (
              <div
                key={`adv-${row.id}`}
                className="rounded-md border border-border/60 bg-background/80 p-3 space-y-2"
              >
                <div className="font-mono text-[11px] font-medium break-all text-foreground">
                  {row.email}
                </div>
                <div className="space-y-1 text-muted-foreground">
                  <p>
                    <span className="text-foreground/80">Provider link id: </span>
                    {row.providerLinkedUserId?.trim() ? row.providerLinkedUserId : "—"}
                  </p>
                  <p>
                    <span className="text-foreground/80">Internal connection: </span>
                    {row.connectionStatus}
                    {" · "}
                    {providerConnectionHint(row, oauthOk)}
                  </p>
                  <p>
                    <span className="text-foreground/80">Send readiness: </span>
                    {eligibilityLabel(row, now, ledger)}
                  </p>
                  {advVm.syncError ? (
                    <p className="text-destructive break-words">
                      <span className="text-foreground/80">Signature sync: </span>
                      {advVm.syncError}
                    </p>
                  ) : null}
                  {row.lastError ? (
                    <p className="text-destructive break-words">
                      <span className="text-foreground/80">Connection last error: </span>
                      {row.lastError}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </details>

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
          Used when composing sends from <strong>{row.email}</strong>. This
          overrides any legacy client-level signature still on file. Plain
          text is used for send bodies today; HTML is stored for future rich
          sends.
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
