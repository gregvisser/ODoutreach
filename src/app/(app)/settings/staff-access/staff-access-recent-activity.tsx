import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listRecentStaffAccessAuditLogs } from "@/server/staff-access/list-recent-staff-audit";

function formatUtc(iso: string): string {
  const d = new Date(iso);
  return `${d.toISOString().replace("T", " ").slice(0, 16)} UTC`;
}

export async function StaffAccessRecentActivity() {
  const rows = await listRecentStaffAccessAuditLogs();

  return (
    <div className="space-y-3 rounded-lg border border-border/80 bg-card/30 p-4">
      <div>
        <h2 className="text-lg font-medium">Recent activity</h2>
        <p className="text-sm text-muted-foreground">
          Audit trail for staff invitations and role changes (newest first). Times are UTC.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No staff access actions recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">When (UTC)</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Target</TableHead>
                <TableHead className="min-w-[240px]">Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap font-mono text-xs">
                    <time dateTime={r.createdAtIso}>{formatUtc(r.createdAtIso)}</time>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.auditAction}</TableCell>
                  <TableCell className="max-w-[200px] break-all font-mono text-xs">
                    {r.actorEmail ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-[200px] break-all font-mono text-xs">
                    {r.targetEmail ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.detail}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
