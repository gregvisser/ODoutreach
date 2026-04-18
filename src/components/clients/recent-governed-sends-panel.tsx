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
import { cn } from "@/lib/utils";
import type { GovernedSendLedgerRow } from "@/server/queries/governed-send-ledger";

function ts(iso: string | null) {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "yyyy-MM-dd HH:mm:ss") + " UTC";
  } catch {
    return iso;
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
      <div className="rounded-md border border-border/80 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">How the ledger relates to “booked (UTC day)”</p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>
            <strong>Booked today</strong> counts{" "}
            <span className="font-mono text-xs">RESERVED</span> +{" "}
            <span className="font-mono text-xs">CONSUMED</span> reservations for the current UTC
            window (<span className="font-mono">{currentUtcWindowKey}</span>), per mailbox — same
            basis as the mailbox table.
          </li>
          <li>
            <span className="font-mono text-xs">CONSUMED</span> — send completed; slot counted
            against the daily cap.
          </li>
          <li>
            <span className="font-mono text-xs">RESERVED</span> — slot held (queued / in flight);
            still counts as booked until released or consumed.
          </li>
          <li>
            <span className="font-mono text-xs">RELEASED</span> — slot returned without sending;
            does not count toward the cap for that window.
          </li>
        </ul>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border/80">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>To</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Mailbox</TableHead>
              <TableHead>Outbound</TableHead>
              <TableHead>Reservation</TableHead>
              <TableHead>UTC window</TableHead>
              <TableHead>Created (UTC)</TableHead>
              <TableHead>Sent (UTC)</TableHead>
              <TableHead>Idempotency</TableHead>
              <TableHead className="text-right">Detail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-muted-foreground">
                  No governed test sends recorded for this workspace yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.outboundId}>
                  <TableCell className="max-w-[180px] align-top font-mono text-xs">
                    {r.toEmail}
                  </TableCell>
                  <TableCell className="max-w-[200px] align-top text-sm">
                    {r.subject ?? "—"}
                  </TableCell>
                  <TableCell className="align-top text-sm">
                    {r.mailboxEmail ? (
                      <div>
                        <div className="font-medium">{r.mailboxEmail}</div>
                        {r.mailboxIdentityId ? (
                          <div className="mt-0.5 font-mono text-[10px] text-muted-foreground break-all">
                            {r.mailboxIdentityId}
                          </div>
                        ) : null}
                      </div>
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
                      {r.outboundStatus}
                    </span>
                  </TableCell>
                  <TableCell className="align-top">
                    {r.reservationStatus ? (
                      <span className="font-mono text-xs">{r.reservationStatus}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="align-top font-mono text-xs">
                    {r.windowKey ?? "—"}
                  </TableCell>
                  <TableCell className="align-top whitespace-nowrap text-xs text-muted-foreground">
                    {ts(r.createdAtIso)}
                  </TableCell>
                  <TableCell className="align-top whitespace-nowrap text-xs text-muted-foreground">
                    {ts(r.sentAtIso)}
                  </TableCell>
                  <TableCell className="align-top font-mono text-[10px] text-muted-foreground">
                    {r.idempotencyKeyShort ?? "—"}
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
