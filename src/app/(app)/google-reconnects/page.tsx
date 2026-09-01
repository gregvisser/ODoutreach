import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { GoogleReconnectRosterEntry } from "@/lib/mailboxes/google-reconnect-roster";
import { cn } from "@/lib/utils";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { getGoogleReconnectRoster } from "@/server/queries/google-reconnects";
import { getAccessibleClientIds } from "@/server/tenant/access";

export const dynamic = "force-dynamic";

/**
 * The weekly Google reconnect chore, on one page instead of eighteen.
 *
 * Why this page exists: the Google OAuth app is deliberately unpublished, so
 * Google expires every mailbox's login seven days after sign-in and somebody has
 * to press Reconnect. Without this screen, finding out which mailboxes are due
 * means opening every client workspace in turn — which is how the job gets half
 * done, and a half-done job here means a client's outreach silently stops.
 *
 * Open to all staff, deliberately: reconnecting is self-service and everybody
 * does it. Nothing on this page mutates anything — it is a list and a set of
 * links to the place the button lives.
 */
export default async function GoogleReconnectsPage() {
  const staff = await requireOpensDoorsStaff();
  const accessible = await getAccessibleClientIds(staff);
  const roster = await getGoogleReconnectRoster(accessible);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Google logins</h1>
        <p className="text-muted-foreground max-w-3xl text-sm">
          Google sign-ins for these mailboxes expire seven days after they were made, so
          each one has to be reconnected weekly. Most urgent first. Microsoft mailboxes
          are not affected and are not listed here.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Need reconnecting"
          value={roster.dueSoonCount}
          hint="Expired, expiring within two days, or never connected"
          tone={roster.dueSoonCount > 0 ? "warn" : "ok"}
        />
        <SummaryCard
          title="Already expired"
          value={roster.overdueCount}
          hint="A live login decayed — these mailboxes are not sending"
          tone={roster.overdueCount > 0 ? "bad" : "ok"}
        />
        <SummaryCard
          title="Not connected"
          value={roster.notConnectedCount}
          hint="Sign-in never finished, failed, or was disconnected — also not sending"
          tone={roster.notConnectedCount > 0 ? "bad" : "ok"}
        />
        <SummaryCard
          title="Google mailboxes"
          value={roster.totalGoogleMailboxes}
          hint="Across every client workspace"
          tone="ok"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Every Google mailbox</CardTitle>
          <CardDescription>
            Open a client&apos;s Mailboxes tab and press Reconnect. Anyone on the team can
            do it; the person who signs in must be able to sign in to that mailbox.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {roster.entries.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No Google mailboxes are connected in any workspace, so there is nothing to
              reconnect. Microsoft mailboxes are unaffected by this weekly expiry.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mailbox</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roster.entries.map((entry) => (
                  <TableRow key={entry.mailboxId}>
                    <TableCell className="font-medium">{entry.email}</TableCell>
                    <TableCell>
                      <Link
                        prefetch={false}
                        className="underline"
                        href={`/clients/${entry.clientId}`}
                      >
                        {entry.clientName}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-md">
                      <div className="flex flex-col gap-1">
                        <StatusBadge entry={entry} />
                        <span className="text-muted-foreground text-xs">{entry.label}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        prefetch={false}
                        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                        href={`/clients/${entry.clientId}/mailboxes`}
                      >
                        Open Mailboxes
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  hint,
  tone,
}: {
  title: string;
  value: number;
  hint: string;
  tone: "ok" | "warn" | "bad";
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle
          className={cn(
            "text-3xl",
            tone === "bad" && "text-destructive",
            tone === "warn" && "text-amber-600",
          )}
        >
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-xs">{hint}</p>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ entry }: { entry: GoogleReconnectRosterEntry }) {
  const status = entry.countdown?.status;
  if (!entry.countdown) {
    return <Badge variant="destructive">Not connected</Badge>;
  }
  if (status === "overdue") {
    return <Badge variant="destructive">Reconnect needed</Badge>;
  }
  if (status === "unknown") {
    return <Badge variant="destructive">Unknown</Badge>;
  }
  if (status === "due") {
    return <Badge variant="secondary">Due this week</Badge>;
  }
  return <Badge variant="outline">In date</Badge>;
}
