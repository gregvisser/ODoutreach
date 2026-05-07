"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import {
  addStaffToClientWorkspace,
  removeClientWorkspaceMember,
  updateClientWorkspaceMemberRole,
  type ClientMembershipActionResult,
} from "@/server/client-membership/actions";
import type { ClientMemberRole } from "@/generated/prisma/enums";
import type { StaffRole } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const WORKSPACE_ROLES: ClientMemberRole[] = ["LEAD", "CONTRIBUTOR", "VIEWER"];

const ROLE_HINTS: Record<ClientMemberRole, string> = {
  LEAD: "Primary workspace owner — full operational permissions for this client.",
  CONTRIBUTOR:
    "Day-to-day outreach — uses mailboxes and outreach tools when staff policy allows.",
  VIEWER: "Read-only access to this workspace.",
};

export type TeamMembershipRow = {
  id: string;
  role: ClientMemberRole;
  staffUser: {
    id: string;
    email: string;
    displayName: string | null;
    role: StaffRole;
    isActive: boolean;
  };
};

export type TeamStaffCandidate = {
  id: string;
  email: string;
  displayName: string | null;
  role: StaffRole;
};

type Props = {
  clientId: string;
  memberships: TeamMembershipRow[];
  staffEligibleToAdd: TeamStaffCandidate[];
  canManageTeam: boolean;
};

function flashMessage(r: ClientMembershipActionResult): string {
  if (!r.ok) return r.error;
  return r.message ?? "Saved.";
}

export function ClientTeamAccessPanel({
  clientId,
  memberships,
  staffEligibleToAdd,
  canManageTeam,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<string | null>(null);

  const [addStaffPick, setAddStaffPick] = useState<string | null>(null);
  const [addRole, setAddRole] = useState<ClientMemberRole>("CONTRIBUTOR");

  const defaultAddStaffId = staffEligibleToAdd[0]?.id ?? "";
  const addStaffId = useMemo(() => {
    if (
      addStaffPick &&
      staffEligibleToAdd.some((s) => s.id === addStaffPick)
    ) {
      return addStaffPick;
    }
    return defaultAddStaffId;
  }, [addStaffPick, defaultAddStaffId, staffEligibleToAdd]);

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Who needs workspace access?</p>
        <p className="mt-2">
          Operators and viewers only see clients they are assigned to. Store the full outreach
          signature and workspace context here by adding staff to this client. Administrators and
          managers already see every workspace — membership is optional for them but can still be
          recorded for clarity.
        </p>
        {!canManageTeam ? (
          <p className="mt-2 text-foreground/90">
            Ask an administrator or manager to add or remove workspace members.
          </p>
        ) : null}
      </div>

      {banner ? (
        <p className="text-sm text-foreground" role="status">
          {banner}
        </p>
      ) : null}

      {memberships.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No staff are assigned to this workspace yet.
        </p>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Staff</TableHead>
            <TableHead>Staff role</TableHead>
            <TableHead>Workspace role</TableHead>
            {canManageTeam ? <TableHead className="w-[120px]" /> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {memberships.map((m) => (
            <TableRow key={m.id}>
              <TableCell className="font-medium">
                <div className="flex flex-col">
                  <span>{m.staffUser.email}</span>
                  {m.staffUser.displayName ? (
                    <span className="text-xs font-normal text-muted-foreground">
                      {m.staffUser.displayName}
                    </span>
                  ) : null}
                  {!m.staffUser.isActive ? (
                    <span className="text-xs text-amber-700 dark:text-amber-400">
                      Inactive staff account
                    </span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">{m.staffUser.role}</TableCell>
              <TableCell>
                {canManageTeam ? (
                  <>
                    <Select
                      value={m.role}
                      disabled={pending}
                      onValueChange={(v) => {
                        const next = v as ClientMemberRole;
                        startTransition(async () => {
                          setBanner(null);
                          const r = await updateClientWorkspaceMemberRole({
                            clientId,
                            membershipId: m.id,
                            membershipRole: next,
                          });
                          setBanner(flashMessage(r));
                          if (r.ok) router.refresh();
                        });
                      }}
                    >
                      <SelectTrigger className="w-[200px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WORKSPACE_ROLES.map((role) => (
                          <SelectItem key={role} value={role}>
                            {role}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="mt-1 text-xs text-muted-foreground">{ROLE_HINTS[m.role]}</p>
                  </>
                ) : (
                  <div className="space-y-1">
                    <Badge variant="secondary">{m.role}</Badge>
                    <p className="text-xs text-muted-foreground">{ROLE_HINTS[m.role]}</p>
                  </div>
                )}
              </TableCell>
              {canManageTeam ? (
                <TableCell className="text-right">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Remove workspace access for ${m.staffUser.email}? They will no longer see this client unless reassigned.`,
                        )
                      ) {
                        return;
                      }
                      startTransition(async () => {
                        setBanner(null);
                        const r = await removeClientWorkspaceMember({
                          clientId,
                          membershipId: m.id,
                        });
                        setBanner(flashMessage(r));
                        if (r.ok) router.refresh();
                      });
                    }}
                  >
                    Remove
                  </Button>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {canManageTeam && staffEligibleToAdd.length > 0 ? (
        <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border/80 p-4">
          <p className="text-sm font-medium text-foreground">Add staff to this workspace</p>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="team-add-staff">Staff member</Label>
              <Select
                value={addStaffId || undefined}
                onValueChange={(v) => setAddStaffPick(v)}
                disabled={pending}
              >
                <SelectTrigger id="team-add-staff">
                  <SelectValue placeholder="Choose staff…" />
                </SelectTrigger>
                <SelectContent>
                  {staffEligibleToAdd.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.email}
                      {s.displayName ? ` (${s.displayName})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full space-y-2 sm:w-[220px]">
              <Label htmlFor="team-add-role">Workspace role</Label>
              <Select
                value={addRole}
                onValueChange={(v) => setAddRole(v as ClientMemberRole)}
                disabled={pending}
              >
                <SelectTrigger id="team-add-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORKSPACE_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              disabled={pending || !addStaffId}
              onClick={() => {
                startTransition(async () => {
                  setBanner(null);
                  const r = await addStaffToClientWorkspace({
                    clientId,
                    staffUserId: addStaffId,
                    membershipRole: addRole,
                  });
                  setBanner(flashMessage(r));
                  if (r.ok) router.refresh();
                });
              }}
            >
              Add to workspace
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{ROLE_HINTS[addRole]}</p>
        </div>
      ) : canManageTeam ? (
        <p className="text-sm text-muted-foreground">
          Every active staff member already has access recorded for this workspace, or there are no
          other staff accounts to add.
        </p>
      ) : null}
    </div>
  );
}
