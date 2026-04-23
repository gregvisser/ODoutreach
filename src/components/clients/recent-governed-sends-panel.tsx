import Link from "next/link";
import { format } from "date-fns";

import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { outboundStatusLabel } from "@/lib/ui/status-labels";
import { cn } from "@/lib/utils";
import type { GovernedSendLedgerRow } from "@/server/queries/governed-send-ledger";

function ts(iso: string | null) {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "d MMM, HH:mm");
  } catch {
    return iso;
  }
}

function reservationLabel(status: string | null): string {
  if (!status) return "—";
  switch (status) {
    case "CONSUMED":
      return "Sent";
    case "RESERVED":
      return "Holding slot";
    case "RELEASED":
      return "Released";
    default:
      return status;
  }
}

export function RecentGovernedSendsPanel({
  rows,
  currentUtcWindowKey,
}: {
  rows: GovernedSendLedgerRow[];
  currentUtcWindowKey: string;
}) {
  return (
    <div className="space-y-4">
      <details className="rounded-md border border-border/80 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground">
          About today&rsquo;s sending totals
        </summary>
        <p className="mt-2">
          Each mailbox has a daily sending cap. &ldquo;Sent today&rdquo; counts
          both finished sends and messages currently being sent — the same
          number shown on the mailbox page. Today&rsquo;s window:{" "}
          <span className="font-medium text-foreground">
            {currentUtcWindowKey}
          </span>{" "}
          (UTC).
        </p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>
            <strong>Sent</strong> — the message went out; the slot is counted.
          </li>
          <li>
            <strong>Holding slot</strong> — the send is queued or in flight;
            the slot is reserved until it completes.
          </li>
          <li>
            <strong>Released</strong> — a reserved slot was returned without
            sending; it doesn&rsquo;t count toward the cap.
          </li>
        </ul>
      </details>

      <div className="overflow-x-auto rounded-lg border border-border/80">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>To</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>From mailbox</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Slot</TableHead>
              <TableHead>Day</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Sent</TableHead>
              <TableHead className="text-right">Detail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-muted-foreground">
                  No test or pilot sends for this client yet. These show up
                  once you dispatch an internal test or pilot email.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.outboundId}>
                  <TableCell className="max-w-[200px] align-top text-sm">
                    {r.toEmail}
                  </TableCell>
                  <TableCell className="max-w-[220px] align-top text-sm">
                    {r.subject ?? "—"}
                  </TableCell>
                  <TableCell className="align-top text-sm">
                    {r.mailboxEmail ? (
                      <div className="font-medium">{r.mailboxEmail}</div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="align-top">
                    <span
                      className={cn(
                        "rounded-md px-1.5 py-0.5 text-xs font-medium",
                        r.outboundStatus === "SENT"
                          ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
                          : r.outboundStatus === "BLOCKED_SUPPRESSION"
                            ? "bg-amber-500/15 text-amber-900 dark:text-amber-100"
                            : "bg-muted text-muted-foreground",
                      )}
                    >
                      {outboundStatusLabel(r.outboundStatus)}
                    </span>
                  </TableCell>
                  <TableCell className="align-top text-xs">
                    {reservationLabel(r.reservationStatus)}
                  </TableCell>
                  <TableCell className="align-top whitespace-nowrap text-xs text-muted-foreground">
                    {r.windowKey ?? "—"}
                  </TableCell>
                  <TableCell className="align-top whitespace-nowrap text-xs text-muted-foreground">
                    {ts(r.createdAtIso)}
                  </TableCell>
                  <TableCell className="align-top whitespace-nowrap text-xs text-muted-foreground">
                    {ts(r.sentAtIso)}
                  </TableCell>
                  <TableCell className="align-top text-right">
                    <Link
                      href={`/activity/outbound/${r.outboundId}`}
                      className={cn(buttonVariants({ variant: "ghost", size: "xs" }))}
                    >
                      View
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
