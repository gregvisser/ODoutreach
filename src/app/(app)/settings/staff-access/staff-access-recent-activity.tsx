import { format } from "date-fns";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  listRecentStaffAccessAuditLogs,
  staffAuditActionLabel,
} from "@/server/staff-access/list-recent-staff-audit";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return format(d, "d MMM yyyy, HH:mm");
}

export async function StaffAccessRecentActivity() {
  const rows = await listRecentStaffAccessAuditLogs();

  return (
    <div className="space-y-3 rounded-lg border border-border/80 bg-card/30 p-4">
      <div>
        <h2 className="text-lg font-medium">Recent activity</h2>
        <p className="text-sm text-muted-foreground">
          Who changed staff access and when (newest first).
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No staff access changes recorded yet. Invite a colleague or update a
          role and it will show up here.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">When</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Done by</TableHead>
                <TableHead>Target</TableHead>
                <TableHead className="min-w-[240px]">Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    <time dateTime={r.createdAtIso}>{formatWhen(r.createdAtIso)}</time>
                  </TableCell>
                  <TableCell className="text-xs">
                    {staffAuditActionLabel(r.auditAction)}
                  </TableCell>
                  <TableCell className="max-w-[200px] break-all text-xs text-muted-foreground">
                    {r.actorEmail ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-[200px] break-all text-xs text-muted-foreground">
                    {r.targetEmail ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.detail}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
