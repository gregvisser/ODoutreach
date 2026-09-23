"use client";

import {
  mailboxConnectActionLabel,
  mailboxConnectActionPlacement,
  MAILBOX_HEALTHY_RECONNECT_ADVANCED_HINT,
  type MailboxConnectCtaRow,
} from "@/lib/mailboxes/mailbox-connection-cta";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type MailboxRowConnectionActionsProps = {
  row: MailboxConnectCtaRow & {
    id: string;
    isPrimary: boolean;
    isActive: boolean;
    connectionStatus: MailboxConnectCtaRow["connectionStatus"];
  };
  now: Date;
  pending: boolean;
  oauthOk: boolean;
  canMutate: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onRemove: () => void;
  onEdit: () => void;
  onSetPrimary: () => void;
};

export function MailboxRowConnectionActions({
  row,
  now,
  pending,
  oauthOk,
  canMutate,
  onConnect,
  onDisconnect,
  onRemove,
  onEdit,
  onSetPrimary,
}: MailboxRowConnectionActionsProps) {
  if (!canMutate) {
    return <span className="text-xs text-muted-foreground">View only</span>;
  }

  const connectLabel = mailboxConnectActionLabel(row, now);
  const connectPlacement = mailboxConnectActionPlacement(row, now);
  const connectDisabled = pending || !oauthOk || !row.isActive;
  const oauthBlockedTitle =
    "An administrator must finish Microsoft/Google setup for this app before mailboxes can connect.";

  const connectButton = (
    <Button
      size="xs"
      variant="secondary"
      disabled={connectDisabled}
      title={
        !oauthOk
          ? oauthBlockedTitle
          : connectPlacement === "advanced"
            ? MAILBOX_HEALTHY_RECONNECT_ADVANCED_HINT
            : undefined
      }
      onClick={onConnect}
    >
      {connectLabel}
    </Button>
  );

  return (
    <div className="flex flex-nowrap gap-1">
      <Button
        size="xs"
        variant="outline"
        disabled={
          pending ||
          !row.isActive ||
          row.isPrimary ||
          row.connectionStatus !== "CONNECTED"
        }
        title={
          row.connectionStatus !== "CONNECTED"
            ? "Connect this mailbox before setting it as primary."
            : undefined
        }
        onClick={onSetPrimary}
      >
        Set primary
      </Button>
      {connectPlacement === "primary" ? connectButton : null}
      <Button
        size="xs"
        variant="outline"
        className="text-destructive border-destructive/50 hover:bg-destructive/10"
        disabled={pending || row.connectionStatus !== "CONNECTED"}
        onClick={onDisconnect}
      >
        Disconnect
      </Button>
      <Button
        size="xs"
        variant="outline"
        className="text-destructive border-destructive/60"
        disabled={pending}
        title="Stops use of this address in the pool. In-app history is kept. Use Disconnect to revoke sign-in only."
        onClick={onRemove}
      >
        Remove
      </Button>
      {connectPlacement === "advanced" ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={pending}
            className="inline-flex h-6 items-center justify-center rounded-[min(var(--radius-md),10px)] px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
          >
            Advanced
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              disabled={connectDisabled}
              onClick={onConnect}
              title={!oauthOk ? oauthBlockedTitle : MAILBOX_HEALTHY_RECONNECT_ADVANCED_HINT}
            >
              {connectLabel}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <Button
        size="xs"
        variant="ghost"
        className="text-muted-foreground"
        disabled={pending}
        onClick={onEdit}
      >
        Edit
      </Button>
    </div>
  );
}
