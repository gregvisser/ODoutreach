"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  inviteStaffUser,
  resendStaffInvitation,
  setStaffActive,
  syncStaffInvitationStatus,
  type StaffActionResult,
} from "./actions";

export type StaffRow = {
  id: string;
  email: string;
  isActive: boolean;
  guestInvitationState: "NONE" | "PENDING" | "ACCEPTED";
  invitedAt: string | null;
  invitationLastSentAt: string | null;
  invitedByEmail: string | null;
  graphInvitedUserObjectId: string | null;
  updatedAt: string;
};

function flashMessage(
  result: StaffActionResult,
  ok: (m: string) => void,
  err: (m: string) => void,
) {
  if (result.ok) {
    ok(result.message ?? "Saved.");
  } else {
    err(result.error);
  }
}

export function StaffAccessPanel({ initialRows }: { initialRows: StaffRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );

  const notify = (result: StaffActionResult) => {
    flashMessage(
      result,
      (m) => {
        setBanner({ type: "ok", text: m });
        router.refresh();
      },
      (m) => setBanner({ type: "err", text: m }),
    );
  };

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">
        <span className="text-foreground font-medium">Staff Access</span> is only for
        people who need to sign in to ODoutreach. Do not add client mailbox owners here
        unless they also work as operators — they can complete Microsoft or Google
        mailbox OAuth without a Staff user row. Optional B2B guest below is for inviting
        operators into the tenant, not for connecting client send mailboxes.
      </p>
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

      <InviteForm
        disabled={pending}
        onInvite={(form) => {
          startTransition(async () => {
            const fd = new FormData(form);
            const email = String(fd.get("email") ?? "");
            const isActive = fd.get("isActive") === "on";
            const r = await inviteStaffUser({ email, isActive });
            notify(r);
            if (r.ok) form.reset();
          });
        }}
      />

      <div className="overflow-x-auto rounded-lg border border-border/80">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead>Sign-in</TableHead>
              <TableHead>Invitation</TableHead>
              <TableHead className="min-w-[220px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initialRows.map((row) => (
              <StaffRowActions
                key={`${row.id}-${row.updatedAt}`}
                row={row}
                disabled={pending}
                onResult={notify}
                startTransition={startTransition}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function InviteForm({
  disabled,
  onInvite,
}: {
  disabled: boolean;
  onInvite: (form: HTMLFormElement) => void;
}) {
  return (
    <form
      className="space-y-4 rounded-lg border border-border/80 bg-card/40 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onInvite(e.currentTarget);
      }}
    >
      <h2 className="text-lg font-medium">Optional: guest invitation (B2B)</h2>
      <p className="text-sm text-muted-foreground">
        Use this when the person should be added to the tenant as a B2B guest
        first. If they are already in{" "}
        <code className="text-xs">StaffUser</code>, they can sign in without
        this step. Microsoft 365 delivers the
        invite; after acceptance they appear in the list below.
      </p>
      <details className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground">
          What the Bidlow Entra admin needs to have configured
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Microsoft Graph <strong>application</strong> permission{" "}
            <code>User.Invite.All</code> on the ODoutreach Entra app
            registration.
          </li>
          <li>
            <strong>Admin consent</strong> granted for that permission.
          </li>
          <li>
            <strong>B2B guest invitations enabled</strong> in the tenant’s
            External Identities settings.
          </li>
          <li>
            If a delegated flow is ever used, the signed-in admin needs the{" "}
            <em>Guest Inviter</em> (or <em>User Administrator</em>) role, or
            tenant-default guest-invite must be allowed.
          </li>
        </ul>
      </details>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="invite-email">Work email</Label>
          <Input
            id="invite-email"
            name="email"
            type="email"
            required
            autoComplete="off"
            placeholder="name@opensdoors.co.uk"
            disabled={disabled}
          />
        </div>
        <div className="flex items-end gap-2 pb-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" name="isActive" defaultChecked className="rounded border-input" />
            Allow sign-in straight away
          </label>
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={disabled}>
            Send invitation
          </Button>
        </div>
      </div>
    </form>
  );
}

function StaffRowActions({
  row,
  disabled,
  onResult,
  startTransition,
}: {
  row: StaffRow;
  disabled: boolean;
  onResult: (r: StaffActionResult) => void;
  startTransition: (cb: () => void) => void;
}) {
  const inviteLabel =
    row.guestInvitationState === "PENDING"
      ? "Invitation sent"
      : row.guestInvitationState === "ACCEPTED"
        ? "Accepted"
        : "—";

  const meta = [
    row.invitedAt ? `Invited ${format(new Date(row.invitedAt), "d MMM yyyy")}` : null,
    row.invitationLastSentAt
      ? `Last sent ${format(new Date(row.invitationLastSentAt), "d MMM yyyy")}`
      : null,
    row.invitedByEmail ? `By ${row.invitedByEmail}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <TableRow>
      <TableCell className="text-sm">{row.email}</TableCell>
      <TableCell>
        <span
          className={cn(
            "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
            row.isActive
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100"
              : "border-border bg-muted text-muted-foreground",
          )}
        >
          {row.isActive ? "Active" : "Blocked"}
        </span>
      </TableCell>
      <TableCell className="max-w-[200px] text-xs text-muted-foreground">
        <div>{inviteLabel}</div>
        {meta ? <div className="mt-1 text-[11px] leading-snug">{meta}</div> : null}
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-full justify-start text-xs"
            disabled={disabled}
            onClick={() => {
              startTransition(async () => {
                const r = await setStaffActive({
                  staffUserId: row.id,
                  isActive: !row.isActive,
                });
                onResult(r);
              });
            }}
          >
            {row.isActive ? "Block sign-in" : "Allow sign-in"}
          </Button>
          {row.guestInvitationState !== "NONE" || row.graphInvitedUserObjectId ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-full justify-start text-xs"
                disabled={disabled || row.guestInvitationState === "ACCEPTED"}
                onClick={() => {
                  startTransition(async () => {
                    const r = await resendStaffInvitation(row.id);
                    onResult(r);
                  });
                }}
              >
                Resend invitation
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-full justify-start text-xs"
                disabled={disabled || !row.graphInvitedUserObjectId}
                onClick={() => {
                  startTransition(async () => {
                    const r = await syncStaffInvitationStatus(row.id);
                    onResult(r);
                  });
                }}
              >
                Refresh invitation status
              </Button>
            </>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}
