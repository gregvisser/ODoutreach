import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SupportTicketDetailActions } from "@/components/support/support-ticket-detail-actions";
import { SupportTicketComments } from "@/components/support/support-ticket-comments";
import {
  supportPriorityBadgeClass,
  supportPriorityLabel,
  supportStatusBadgeClass,
  supportStatusLabel,
} from "@/lib/support/support-labels";
import { prisma } from "@/lib/db";
import { requireOpensDoorsStaff } from "@/server/auth/staff";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ ticketId: string }> };

export default async function SupportTicketDetailPage({ params }: Props) {
  const staff = await requireOpensDoorsStaff();
  const { ticketId } = await params;

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: {
      createdBy: { select: { displayName: true, email: true } },
      attachments: {
        select: { id: true, fileName: true, mimeType: true, sizeBytes: true },
      },
      comments: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { displayName: true, email: true } } },
      },
    },
  });
  if (!ticket) notFound();

  const isOwner = staff.isSuperAdmin;

  const developerSummary = [
    `ODoutreach support ticket ${ticket.id}`,
    `Title: ${ticket.title}`,
    `Priority: ${supportPriorityLabel(ticket.priority)}`,
    `Status: ${supportStatusLabel(ticket.status)}`,
    `Reported by: ${ticket.reporterEmail}`,
    `Logged: ${format(ticket.createdAt, "d MMM yyyy, HH:mm")}`,
    `Screenshots attached: ${ticket.attachments.length}`,
    "",
    "Issue detail:",
    ticket.description,
  ].join("\n");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link prefetch={false}
          href="/support"
          className="text-sm text-muted-foreground underline-offset-2 hover:underline"
        >
          ← All tickets
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{ticket.title}</h1>
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${supportPriorityBadgeClass(ticket.priority)}`}
            >
              {supportPriorityLabel(ticket.priority)}
            </span>
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${supportStatusBadgeClass(ticket.status)}`}
            >
              {supportStatusLabel(ticket.status)}
            </span>
          </div>
        </div>
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
          <CardDescription>
            Logged by {ticket.createdBy?.displayName ?? ticket.reporterEmail} (
            {ticket.reporterEmail}) on{" "}
            {format(ticket.createdAt, "d MMM yyyy, HH:mm")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="whitespace-pre-wrap text-sm text-foreground">
            {ticket.description}
          </p>

          {ticket.attachments.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Screenshots
              </p>
              <div className="flex flex-wrap gap-3">
                {ticket.attachments.map((a) => (
                  <a
                    key={a.id}
                    href={`/api/support/attachments/${a.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                    title={a.fileName}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/support/attachments/${a.id}`}
                      alt={a.fileName}
                      className="h-28 w-auto rounded-md border border-border/70 object-cover"
                    />
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {ticket.resolutionNote ? (
        <Card className="border-emerald-600/30 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Resolution</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-foreground">
              {ticket.resolutionNote}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Replies</CardTitle>
          <CardDescription>
            Ask a question or narrate progress before the ticket is resolved.
            Visible to the reporter and the developer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SupportTicketComments
            ticketId={ticket.id}
            comments={ticket.comments.map((c) => ({
              id: c.id,
              body: c.body,
              createdAt: c.createdAt,
              authorEmail: c.authorEmail,
              authorName: c.author?.displayName ?? null,
            }))}
          />
        </CardContent>
      </Card>

      <SupportTicketDetailActions
        ticketId={ticket.id}
        status={ticket.status}
        isOwner={isOwner}
        developerSummary={developerSummary}
      />
    </div>
  );
}
