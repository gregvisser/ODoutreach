import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireStaffUser } from "@/server/auth/staff";
import { getOutboundEmailByIdForStaff } from "@/server/queries/outbound-detail";
import { getAccessibleClientIds } from "@/server/tenant/access";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

function formatStatus(status: string) {
  return status.replace(/_/g, " ");
}

export default async function OutboundDetailPage({ params }: Props) {
  const { id } = await params;
  const staff = await requireStaffUser();
  const accessible = await getAccessibleClientIds(staff);
  const row = await getOutboundEmailByIdForStaff(id, accessible);

  if (!row) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/activity"
            className="text-sm text-muted-foreground underline-offset-2 hover:underline"
          >
            ← Activity
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Outbound email</h1>
          <p className="mt-1 text-sm text-muted-foreground">{row.client.name}</p>
        </div>
        <Badge variant="outline" className="w-fit capitalize">
          {formatStatus(row.status)}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Routing</CardTitle>
          <CardDescription>Workspace-scoped identifiers for provider correlation</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid gap-1 sm:grid-cols-[120px_1fr] sm:gap-3">
            <span className="text-muted-foreground">To</span>
            <span className="font-mono">{row.toEmail}</span>
            <span className="text-muted-foreground">From</span>
            <span>{row.fromAddress ?? "—"}</span>
            <span className="text-muted-foreground">Subject</span>
            <span>{row.subject ?? "—"}</span>
            <span className="text-muted-foreground">Correlation</span>
            <span className="break-all font-mono text-xs">{row.correlationId}</span>
            <span className="text-muted-foreground">Provider id</span>
            <span className="break-all font-mono text-xs">
              {row.providerMessageId ?? "—"}
            </span>
            <span className="text-muted-foreground">Provider</span>
            <span>{row.providerName ?? "—"}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          {(
            [
              ["Queued", row.queuedAt],
              ["Attempted", row.attemptedAt],
              ["Sent", row.sentAt],
              ["Delivered", row.deliveredAt],
              ["Bounced", row.bouncedAt],
              ["Created", row.createdAt],
            ] as const
          ).map(([label, d]) => (
            <div key={label} className="flex justify-between gap-4 border-b border-border/40 py-2 last:border-0">
              <span className="text-muted-foreground">{label}</span>
              <span className="tabular-nums text-muted-foreground">
                {d ? format(d, "MMM d, yyyy HH:mm:ss") : "—"}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Send operations</CardTitle>
          <CardDescription>Retries and last provider signal</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <span className="text-muted-foreground">Retries</span>
            <p className="font-mono">{row.retryCount}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Last event</span>
            <p>{row.lastProviderEventType ?? "—"}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Provider status</span>
            <p>{row.providerStatus ?? "—"}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Bounce category</span>
            <p>{row.bounceCategory ?? "—"}</p>
          </div>
          {row.lastErrorCode ? (
            <div className="sm:col-span-2">
              <span className="text-muted-foreground">Last error code</span>
              <p className="font-mono text-xs">{row.lastErrorCode}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {row.lastErrorMessage || row.failureReason ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-destructive">Failure / last error</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap break-words text-sm">
              {row.lastErrorMessage ?? row.failureReason}
            </pre>
          </CardContent>
        </Card>
      ) : null}

      {row.suppressionSnapshot ? (
        <Card>
          <CardHeader>
            <CardTitle>Suppression decision</CardTitle>
            <CardDescription>Snapshot at send time (audit)</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="max-h-48 overflow-auto rounded-md bg-muted/50 p-3 text-xs">
              {JSON.stringify(row.suppressionSnapshot, null, 2)}
            </pre>
          </CardContent>
        </Card>
      ) : null}

      {row.bodySnapshot ? (
        <Card>
          <CardHeader>
            <CardTitle>Message body (snapshot)</CardTitle>
            <CardDescription>Operational copy — not a CRM artifact</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className={cn("whitespace-pre-wrap break-words text-sm")}>{row.bodySnapshot}</pre>
          </CardContent>
        </Card>
      ) : null}

      {row.providerEvents.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Provider events</CardTitle>
            <CardDescription>Webhook / ESP lifecycle (audit)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {row.providerEvents.map((ev) => (
              <div
                key={ev.id}
                className="flex justify-between gap-2 border-b border-border/40 py-1 last:border-0"
              >
                <span className="font-mono text-xs">{ev.eventType}</span>
                <span className="text-xs text-muted-foreground">
                  {format(ev.createdAt, "MMM d HH:mm:ss")}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Inbound replies</CardTitle>
          <CardDescription>
            Linked when ingestion matches this outbound&apos;s provider id in the same workspace
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {row.inboundReplies.length === 0 ? (
            <p className="text-sm text-muted-foreground">No replies linked yet.</p>
          ) : (
            row.inboundReplies.map((r) => (
              <div
                key={r.id}
                className="rounded-lg border border-border/60 bg-card/50 px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{r.fromEmail}</span>
                  <span className="text-xs text-muted-foreground">
                    {format(r.receivedAt, "MMM d HH:mm")}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-2">
                  <Badge variant="secondary" className="text-[10px]">
                    {r.matchMethod.replace(/_/g, " ")}
                  </Badge>
                </div>
                {r.snippet ? (
                  <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">{r.snippet}</p>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        {row.contact ? (
          <Link
            href={`/contacts?client=${row.clientId}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Back to contacts
          </Link>
        ) : null}
      </div>
    </div>
  );
}
