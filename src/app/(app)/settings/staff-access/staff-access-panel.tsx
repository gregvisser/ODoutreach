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
import { STAFF_ROLE_LABELS } from "@/lib/ui/status-labels";

import {
  inviteStaffUser,
  resendStaffInvitation,
  setStaffActive,
  syncStaffInvitationStatus,
  updateStaffRole,
  type StaffActionResult,
} from "./actions";

const ROLES = ["ADMIN", "MANAGER", "OPERATOR", "VIEWER"] as const;

const ROLE_HINTS: Record<(typeof ROLES)[number], string> = {
  ADMIN: "Full access, including staff and settings",
  MANAGER: "Manage clients, sending, and approvals",
  OPERATOR: "Day-to-day outreach work",
  VIEWER: "Read-only access",
};

export type StaffRow = {
  id: string;
  email: string;
  role: (typeof ROLES)[number];
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
            const role = String(fd.get("role") ?? "OPERATOR") as StaffRow["role"];
            const isActive = fd.get("isActive") === "on";
            const r = await inviteStaffUser({ email, role, isActive });
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
              <TableHead>Role</TableHead>
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
      <h2 className="text-lg font-medium">Invite a colleague</h2>
      <p className="text-sm text-muted-foreground">
        Microsoft 365 sends the invitation email. They accept, sign in, and
        complete any MFA your organisation requires — after that they appear in
        the list below with the role you choose here.
      </p>
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
        <div className="space-y-2">
          <Label htmlFor="invite-role">Role</Label>
          <select
            id="invite-role"
            name="role"
            defaultValue="OPERATOR"
            disabled={disabled}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {STAFF_ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground">
            {ROLE_HINTS.OPERATOR}
          </p>
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
  const [role, setRole] = useState(row.role);

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
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as StaffRow["role"])}
            disabled={disabled}
            className="h-8 max-w-[160px] rounded-md border border-input bg-transparent px-2 text-xs"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {STAFF_ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-8 text-xs"
            disabled={disabled || role === row.role}
            onClick={() => {
              startTransition(async () => {
                const r = await updateStaffRole({ staffUserId: row.id, role });
                onResult(r);
              });
            }}
          >
            Save role
          </Button>
        </div>
      </TableCell>
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
