import Link from "next/link";
import { format } from "date-fns";

import {
  requeueFailedFormAction,
  releaseStaleFormAction,
  verifySenderFormAction,
} from "@/app/(app)/operations/outbound/form-actions";
import {
  SenderReadinessHeadlineBadge,
  SenderReadinessPanel,
} from "@/components/ops/sender-readiness-panel";
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
import { describeSenderReadiness } from "@/lib/sender-readiness";
import { cn } from "@/lib/utils";
import { requireStaffUser } from "@/server/auth/staff";
import { listClientsForStaff } from "@/server/queries/clients";
import { getOutboundOperationsSnapshot } from "@/server/queries/outbound-operations";
import { getAccessibleClientIds } from "@/server/tenant/access";

export const dynamic = "force-dynamic";

type Props = { searchParams?: Promise<{ client?: string }> };

export default async function OutboundOperationsPage({ searchParams }: Props) {
  const staff = await requireStaffUser();
  const accessible = await getAccessibleClientIds(staff);
  const sp = (await searchParams) ?? {};
  const clientFilter =
    sp.client && accessible.includes(sp.client) ? sp.client : undefined;
  const clients = await listClientsForStaff(accessible);
  const snap = await getOutboundOperationsSnapshot(accessible, clientFilter);

  const selectedClient = clientFilter
    ? clients.find((c) => c.id === clientFilter)
    : undefined;
  const selectedSenderReport = selectedClient
    ? describeSenderReadiness({
        defaultSenderEmail: selectedClient.defaultSenderEmail,
        senderIdentityStatus: selectedClient.senderIdentityStatus,
      })
    : null;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Outbound operations</h1>
        <p className="mt-1 max-w-3xl text-muted-foreground">
          Reliability view: stuck queue, stale processing, safe operator retry (only when no provider
          message id exists — avoids duplicate ESP sends), and recent provider events.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Workspace:</span>
        <Link
          href="/operations/outbound"
          className={cn(
            buttonVariants({ variant: !clientFilter ? "secondary" : "outline", size: "sm" }),
          )}
        >
          All in scope
        </Link>
        {clients.map((c) => (
          <Link
            key={c.id}
            href={`/operations/outbound?client=${c.id}`}
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

      {!clientFilter ? (
        <Card>
          <CardHeader>
            <CardTitle>Sender readiness by workspace</CardTitle>
            <CardDescription>
              Quick view across clients you can access — open a row in Outbound ops or client detail for
              full checks.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Workspace</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Effective From (preview)</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((c) => {
                  const r = describeSenderReadiness({
                    defaultSenderEmail: c.defaultSenderEmail,
                    senderIdentityStatus: c.senderIdentityStatus,
                  });
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>
                        <SenderReadinessHeadlineBadge headline={r.headline} />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.effectiveFrom}</TableCell>
                      <TableCell className="text-right">
                        <Link
                          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                          href={`/operations/outbound?client=${c.id}`}
                        >
                          Ops
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {clients.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No workspaces in scope.</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Stale processing claims</CardTitle>
            <CardDescription>
              PROCESSING past claim expiry with no provider message id — release back to QUEUED
            </CardDescription>
          </div>
          <form action={releaseStaleFormAction}>
            <button type="submit" className={cn(buttonVariants({ size: "sm" }))}>
              Release stale locks
            </button>
          </form>
        </CardHeader>
      </Card>

      {clientFilter && selectedSenderReport ? (
        <Card>
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle>Sender readiness (selected workspace)</CardTitle>
              <CardDescription>
                After DNS/domain verification in Resend, mark <strong>VERIFIED_READY</strong> here — this
                does not replace Resend dashboard checks.
              </CardDescription>
            </div>
            <form action={verifySenderFormAction}>
              <input type="hidden" name="clientId" value={clientFilter} />
              <button type="submit" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                Mark VERIFIED_READY
              </button>
            </form>
          </CardHeader>
          <CardContent>
            <SenderReadinessPanel report={selectedSenderReport} />
          </CardContent>
        </Card>
      ) : null}

      <OpsTable
        title="Old QUEUED (waiting &gt; 30m)"
        description="May need worker/cron or queue drain"
        rows={snap.stuckQueued}
        empty="No aged queue rows."
      />

      <OpsTable
        title="Stale PROCESSING (claim expired)"
        rows={snap.staleProcessing}
        empty="No stale processing rows."
      />

      <OpsTable
        title="FAILED — safe operator retry"
        description="Only rows with no provider message id"
        rows={snap.failedNoProvider}
        empty="None — or failures already have provider ids (manual review only)."
        requeue
      />

      <OpsTable title="Recent bounces" rows={snap.bounced} empty="No bounces in filter." />

      <Card>
        <CardHeader>
          <CardTitle>Recent provider events</CardTitle>
          <CardDescription>
            Append-only audit; duplicate Svix deliveries are deduped — state not double-applied. Use{" "}
            <span className="font-mono">dedupeHash</span> / provider id to correlate with Resend logs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Provider msg id</TableHead>
                <TableHead>Outbound</TableHead>
                <TableHead>Flags / note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {snap.recentEvents.map((ev) => (
                <TableRow key={ev.id}>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {format(ev.receivedAt, "MMM d HH:mm:ss")}
                  </TableCell>
                  <TableCell>{ev.client?.name ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{ev.eventType}</TableCell>
                  <TableCell className="font-mono text-[11px] text-muted-foreground max-w-[140px] truncate" title={ev.providerMessageId ?? undefined}>
                    {ev.providerMessageId ?? "—"}
                  </TableCell>
                  <TableCell>
                    {ev.outbound ? (
                      <Link
                        className="underline-offset-2 hover:underline"
                        href={`/activity/outbound/${ev.outbound.id}`}
                      >
                        {ev.outbound.toEmail}{" "}
                        <span className="text-muted-foreground">({ev.outbound.status})</span>
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-xs max-w-[220px]">
                    <div className="flex flex-wrap gap-1">
                      {ev.replayDuplicate ? <Badge variant="secondary">replay</Badge> : null}
                      {ev.stateMutated ? <Badge variant="outline">mutated</Badge> : null}
                    </div>
                    {ev.processingNote ? (
                      <p className="mt-1 text-muted-foreground leading-snug">{ev.processingNote}</p>
                    ) : null}
                    <p className="mt-1 font-mono text-[10px] text-muted-foreground truncate" title={ev.dedupeHash}>
                      {ev.dedupeHash}
                    </p>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {snap.recentEvents.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No events yet.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function OpsTable({
  title,
  description,
  rows,
  empty,
  requeue,
}: {
  title: string;
  description?: string;
  rows: {
    id: string;
    clientId: string;
    toEmail: string;
    status: string;
    client: { name: string };
  }[];
  empty: string;
  requeue?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>To</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.toEmail}</TableCell>
                <TableCell>{row.client.name}</TableCell>
                <TableCell>
                  <Badge variant="outline">{row.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Link
                    className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                    href={`/activity/outbound/${row.id}`}
                  >
                    Detail
                  </Link>
                  {requeue ? (
                    <form className="inline-block ml-2" action={requeueFailedFormAction}>
                      <input type="hidden" name="outboundEmailId" value={row.id} />
                      <input type="hidden" name="clientId" value={row.clientId} />
                      <button type="submit" className={cn(buttonVariants({ size: "sm" }))}>
                        Requeue
                      </button>
                    </form>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
