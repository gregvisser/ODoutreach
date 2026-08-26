import Link from "next/link";

import { WorkspaceRestoreButton } from "@/components/clients/workspace-restore-button";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  WORKSPACE_RECOVERY_WINDOW_DAYS,
  isWithinRecoveryWindow,
  recoveryDaysRemaining,
} from "@/lib/clients/workspace-deletion-confirm";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/utils";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { listSoftDeletedClients } from "@/server/queries/clients";

export const dynamic = "force-dynamic";

function formatDateTime(value: Date): string {
  return value.toISOString().slice(0, 16).replace("T", " ");
}

export default async function DeletedWorkspacesPage() {
  const staff = await requireOpensDoorsStaff();

  if (!staff.isSuperAdmin) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-2xl font-semibold">Deleted workspaces</h1>
        <p className="text-muted-foreground">
          Only a super-admin can view or restore deleted workspaces.
        </p>
        <Link
          href="/settings"
          className={cn(buttonVariants({ variant: "outline" }), "inline-flex")}
        >
          Back to settings
        </Link>
      </div>
    );
  }

  const deleted = await listSoftDeletedClients();

  const deleterIds = Array.from(
    new Set(
      deleted
        .map((c) => c.deletedByStaffUserId)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const deleters =
    deleterIds.length > 0
      ? await prisma.staffUser.findMany({
          where: { id: { in: deleterIds } },
          select: { id: true, email: true },
        })
      : [];
  const deleterEmail = new Map(deleters.map((d) => [d.id, d.email]));

  const now = new Date();

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Deleted workspaces</h1>
        <p className="text-muted-foreground">
          Soft-deleted workspaces are hidden everywhere and stop sending, but
          their data is untouched and they can be restored for{" "}
          {WORKSPACE_RECOVERY_WINDOW_DAYS} days. Permanent destruction is a
          separate, deliberate step that is not available here.
        </p>
      </div>

      {deleted.length === 0 ? (
        <Card className="border-border/80 shadow-sm">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No deleted workspaces.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {deleted.map((c) => {
            const deletedAt = c.deletedAt as Date;
            const withinWindow = isWithinRecoveryWindow(deletedAt, now);
            const daysLeft = recoveryDaysRemaining(deletedAt, now);
            return (
              <li key={c.id}>
                <Card className="border-border/80 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-lg">{c.name}</CardTitle>
                    <CardDescription>
                      Deleted {formatDateTime(deletedAt)}
                      {c.deletedByStaffUserId
                        ? ` by ${deleterEmail.get(c.deletedByStaffUserId) ?? "a former staff member"}`
                        : ""}{" "}
                      · {c._count.contacts} contacts · {c._count.emailSequences}{" "}
                      sequences
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between gap-4">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-medium",
                        withinWindow
                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                          : "bg-amber-500/10 text-amber-700 dark:text-amber-300",
                      )}
                    >
                      {withinWindow
                        ? `Recoverable for ${daysLeft} more day${daysLeft === 1 ? "" : "s"}`
                        : "Past recovery window (purge eligible)"}
                    </span>
                    <WorkspaceRestoreButton clientId={c.id} clientName={c.name} />
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
