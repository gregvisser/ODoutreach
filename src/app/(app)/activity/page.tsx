import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";

import { StickyFilterBar } from "@/components/app-shell/sticky-filter-bar";
import { ClientPicker } from "@/components/clients/client-picker";
import { Badge } from "@/components/ui/badge";
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
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { listInboundForStaff, listOutboundForStaff } from "@/server/queries/activity";
import { listClientsForStaff } from "@/server/queries/clients";
import { getAccessibleClientIds } from "@/server/tenant/access";

export const dynamic = "force-dynamic";

type Props = { searchParams?: Promise<{ client?: string }> };

/**
 * Global Activity is an admin-only legacy debug surface (PR #140 — G11).
 *
 * Per-client Activity (`/clients/[id]/activity`) is the trusted
 * operational view: it groups replies by mailbox, links into the
 * reply-detail page, surfaces stop-follow-ups, and filters out random
 * mailbox inbox mail. The cross-client tables here are not part of the
 * day-to-day staff flow and have routinely confused operators.
 *
 * Non-admin staff land on `/clients` so they can pick a workspace and
 * use the per-client Activity tab. The route is intentionally not in
 * the staff sidebar (removed in PR #140).
 */
export default async function ActivityPage({ searchParams }: Props) {
  const staff = await requireOpensDoorsStaff();
  if (!staff.isSuperAdmin) {
    redirect("/clients");
  }
  const accessible = await getAccessibleClientIds(staff);
  const sp = (await searchParams) ?? {};
  const rawFilter = sp.client;
  const clientFilter =
    rawFilter && accessible.includes(rawFilter) ? rawFilter : undefined;
  const [outbound, inbound, clients] = await Promise.all([
    listOutboundForStaff(accessible, clientFilter),
    listInboundForStaff(accessible, clientFilter),
    listClientsForStaff(accessible),
  ]);

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <p className="rounded-lg border border-amber-400/40 bg-amber-50/60 px-4 py-3 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200">
        <span className="font-medium">Administrator view.</span>{" "}
        Day-to-day activity lives on each client&apos;s Activity tab. Open a client from{" "}
        <Link prefetch={false}
          href="/clients"
          className="font-medium underline-offset-2 hover:underline"
        >
          Clients
        </Link>{" "}
        and use Activity. That tab groups replies by mailbox, opens the reply,
        and hides unrelated inbox mail. This page is a cross-client check and
        is not in the menu.
      </p>
      <StickyFilterBar className="lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Activity</h1>
          <p className="mt-1 text-muted-foreground">
            Sends and replies across clients. Choose one client when you need to.
          </p>
        </div>
        <ClientPicker
          clients={clients.map((c) => ({
            id: c.id,
            name: c.name,
            href: `/activity?client=${c.id}`,
          }))}
          value={clientFilter ?? null}
          allLabel="All accessible clients"
          allHref="/activity"
        />
      </StickyFilterBar>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle>Sent emails</CardTitle>
            <CardDescription>Emails this team has sent</CardDescription>
          </CardHeader>
          <CardContent>
            <Table scroll="contained">
              <TableHeader>
                <TableRow>
                  <TableHead>To</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outbound.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="max-w-[160px]">
                      <Link prefetch={false}
                        href={`/activity/outbound/${row.id}`}
                        className="block truncate font-medium underline-offset-2 hover:underline"
                      >
                        {row.toEmail}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[140px] truncate text-muted-foreground">
                      {row.subject ?? "—"}
                    </TableCell>
                    <TableCell>{row.client.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {row.status.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {row.sentAt
                        ? format(row.sentAt, "MMM d HH:mm")
                        : format(row.createdAt, "MMM d HH:mm")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle>Replies</CardTitle>
            <CardDescription>Replies that came back</CardDescription>
          </CardHeader>
          <CardContent>
            <Table scroll="contained">
              <TableHeader>
                <TableRow>
                  <TableHead>From</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Match</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inbound.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="font-medium">{row.fromEmail}</div>
                      {row.subject ? (
                        <div className="truncate text-xs text-muted-foreground">{row.subject}</div>
                      ) : null}
                      {row.snippet ? (
                        <div className="line-clamp-2 text-xs text-muted-foreground">
                          {row.snippet}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>{row.client.name}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant="secondary" className="w-fit text-[10px] capitalize">
                          {row.matchMethod.replace(/_/g, " ")}
                        </Badge>
                        {row.linkedOutbound ? (
                          <Link prefetch={false}
                            href={`/activity/outbound/${row.linkedOutbound.id}`}
                            className="text-xs underline-offset-2 hover:underline"
                          >
                            Outbound: {row.linkedOutbound.subject ?? row.linkedOutbound.id.slice(0, 8)}
                          </Link>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {format(row.receivedAt, "MMM d HH:mm")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
