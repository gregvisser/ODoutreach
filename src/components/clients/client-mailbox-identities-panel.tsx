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
    return "Server OAuth for this provider is not configured — set mailbox OAuth env vars.";
  }
  switch (row.connectionStatus) {
    case "DRAFT":
      return "Not yet authorized — use Connect to start OAuth.";
    case "PENDING_CONNECTION":
      return "Complete sign-in in the Microsoft or Google window, or run Connect again.";
    case "CONNECTED":
      return row.connectedAt
        ? `Authorized — linked ${format(new Date(row.connectedAt), "MMM d, yyyy HH:mm")} UTC`
        : "Authorized with provider.";
    case "CONNECTION_ERROR":
      return "Authorization failed — see Last error, fix, then Reconnect.";
    case "DISCONNECTED":
      return "Tokens cleared — use Connect to authorize again.";
    default:
      return "";
  }
}

function eligibilityLabel(row: MailboxIdentityRow, now: Date) {
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
  return eligible ? "Ready to send (when pipeline is enabled)" : "Not eligible to send";
}

export function ClientMailboxIdentitiesPanel({
  clientId,
  rows,
  canMutate,
  oauthMicrosoftConfigured,
  oauthGoogleConfigured,
  mailboxOAuthBanner,
}: {
  clientId: string;
  rows: MailboxIdentityRow[];
  canMutate: boolean;
  oauthMicrosoftConfigured: boolean;
  oauthGoogleConfigured: boolean;
  mailboxOAuthBanner: { type: "ok" | "err"; text: string } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );
  const [addOpen, setAddOpen] = useState(false);
  const [editRow, setEditRow] = useState<MailboxIdentityRow | null>(null);

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
          . Default send cap per mailbox: {DEFAULT_MAILBOX_DAILY_SEND_CAP}/day (product rule).
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
                title="Add mailbox identity"
                description="Creates a draft identity — then use Connect to authorize with the selected provider."
                submitLabel="Create"
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
              <TableHead>Send readiness</TableHead>
              <TableHead className="text-right">Daily cap / sent</TableHead>
              <TableHead className="min-w-[220px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  No mailbox identities yet. Add up to five active mailboxes per client.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
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
                      {eligibilityLabel(row, now)}
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
                      {row.dailySendCap} / {row.emailsSentToday}
                      {row.dailyWindowResetAt ? (
                        <div className="text-xs text-muted-foreground">
                          Resets UTC {format(new Date(row.dailyWindowResetAt), "MMM d HH:mm")}
                        </div>
                      ) : null}
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
