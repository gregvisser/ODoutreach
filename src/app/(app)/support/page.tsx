import Link from "next/link";
import { format } from "date-fns";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SupportTicketForm } from "@/components/support/support-ticket-form";
import {
  supportPriorityBadgeClass,
  supportPriorityLabel,
  supportStatusBadgeClass,
  supportStatusLabel,
} from "@/lib/support/support-labels";
import { prisma } from "@/lib/db";
import { requireOpensDoorsStaff } from "@/server/auth/staff";

export const dynamic = "force-dynamic";

// Open work first, then most-recent.
const STATUS_ORDER: Record<string, number> = {
  AWAITING_APPROVAL: 0,
  OPEN: 1,
  IN_REVIEW: 2,
  APPROVED: 3,
  REJECTED: 4,
  RESOLVED: 5,
};

export default async function SupportPage() {
  await requireOpensDoorsStaff();

  const tickets = await prisma.supportTicket.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
    select: {
      id: true,
      title: true,
      priority: true,
      status: true,
      reporterEmail: true,
      createdAt: true,
      createdBy: { select: { displayName: true, email: true } },
      _count: { select: { attachments: true } },
    },
  });

  const sorted = [...tickets].sort((a, b) => {
    const sa = STATUS_ORDER[a.status] ?? 9;
    const sb = STATUS_ORDER[b.status] ?? 9;
    if (sa !== sb) return sa - sb;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Support
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Tickets</h1>
        <p className="mt-1 text-muted-foreground">
          Report any issue you hit using ODoutreach. Add screenshots and a
          priority — the team reviews each ticket, and fixes are authorised
          before they go live.
        </p>
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Log a new ticket</CardTitle>
          <CardDescription>
            Your name and the time are recorded automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SupportTicketForm />
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">All tickets</CardTitle>
          <CardDescription>
            {tickets.length} ticket{tickets.length === 1 ? "" : "s"}. Newest and
            most urgent first.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {sorted.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              No tickets yet.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5">Ticket</th>
                  <th className="px-3 py-2.5">Priority</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Logged by</th>
                  <th className="px-3 py-2.5">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {sorted.map((t) => (
                  <tr key={t.id} className="align-top hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <Link
                        href={`/support/${t.id}`}
                        className="font-medium text-foreground underline-offset-2 hover:underline"
                      >
                        {t.title}
                      </Link>
                      {t._count.attachments > 0 ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          📎 {t._count.attachments}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${supportPriorityBadgeClass(t.priority)}`}
                      >
                        {supportPriorityLabel(t.priority)}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${supportStatusBadgeClass(t.status)}`}
                      >
                        {supportStatusLabel(t.status)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {t.createdBy?.displayName ?? t.reporterEmail}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                      {format(t.createdAt, "d MMM yyyy, HH:mm")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
