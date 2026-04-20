import Link from "next/link";
import { format } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
import { requireStaffUser } from "@/server/auth/staff";
import { listInboundForStaff, listOutboundForStaff } from "@/server/queries/activity";
import { listClientsForStaff } from "@/server/queries/clients";
import { getAccessibleClientIds } from "@/server/tenant/access";

export const dynamic = "force-dynamic";

type Props = { searchParams?: Promise<{ client?: string }> };

export default async function ActivityPage({ searchParams }: Props) {
  const staff = await requireStaffUser();
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
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Activity</h1>
          <p className="mt-1 text-muted-foreground">
            Cross-client sends and inbound replies — filter by workspace when needed.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/activity"
            className={cn(
              buttonVariants({
                variant: !clientFilter ? "secondary" : "outline",
                size: "sm",
              }),
            )}
          >
            All
          </Link>
          {clients.map((c) => (
            <Link
              key={c.id}
              href={`/activity?client=${c.id}`}
              className={cn(
                buttonVariants({
                  variant: clientFilter === c.id ? "secondary" : "outline",
                  size: "sm",
                }),
              )}
            >
              {c.name}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle>Sent emails</CardTitle>
            <CardDescription>Outbound operational log</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
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
                      <Link
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
            <CardDescription>Inbound reply capture</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
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
                          <Link
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
