import Link from "next/link";
import { notFound } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { loadClientContactListDetail } from "@/server/queries/client-contact-list-detail";
import { getAccessibleClientIds } from "@/server/tenant/access";
import { ListDetailContactTable } from "@/components/lists/list-detail-contact-table";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ clientId: string; listId: string }>;
};

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warning" | "error";
}) {
  return (
    <div
      className={`rounded-md border border-border/80 bg-card px-3 py-2 shadow-sm ${
        tone === "warning"
          ? "border-amber-400/60"
          : tone === "error"
            ? "border-destructive/50"
            : ""
      }`}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-1 text-xl font-semibold tabular-nums ${
          tone === "warning"
            ? "text-amber-600"
            : tone === "error"
              ? "text-destructive"
              : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export default async function ListDetailPage({ params }: Props) {
  const staff = await requireOpensDoorsStaff();
  const accessible = await getAccessibleClientIds(staff);
  const { clientId, listId } = await params;

  if (!accessible.includes(clientId)) notFound();

  const detail = await loadClientContactListDetail(clientId, listId);
  if (!detail) notFound();

  const { summary } = detail;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Link prefetch={false}
            href={`/clients/${clientId}/sources`}
            className="underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground/60"
          >
            Sources
          </Link>
          {" · "}
          {detail.clientName}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {detail.listName}
        </h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">
          {detail.isArchived
            ? "Archived list — contacts remain available in Universe."
            : `Created ${DATE_FMT.format(detail.createdAt)} · Updated ${DATE_FMT.format(detail.updatedAt)}`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 lg:grid-cols-10">
        <SummaryCard label="Total contacts" value={summary.totalContacts} />
        <SummaryCard label="Email-sendable" value={summary.emailSendable} />
        <SummaryCard label="Sent" value={summary.sent} />
        <SummaryCard label="Awaiting send" value={summary.awaitingSend} />
        <SummaryCard
          label="Queued"
          value={summary.queued}
          tone={summary.queued > 0 ? "warning" : undefined}
        />
        <SummaryCard
          label="Not confirmed"
          value={summary.sentProofMissing}
          tone={summary.sentProofMissing > 0 ? "error" : undefined}
        />
        <SummaryCard
          label="Failed"
          value={summary.failed}
          tone={summary.failed > 0 ? "error" : undefined}
        />
        <SummaryCard
          label="Bounced"
          value={summary.bounced}
          tone={summary.bounced > 0 ? "warning" : undefined}
        />
        <SummaryCard label="Replies" value={summary.replied} />
        <SummaryCard
          label="Unsubscribed"
          value={summary.unsubscribed}
          tone={summary.unsubscribed > 0 ? "warning" : undefined}
        />
        <SummaryCard label="Suppressed" value={summary.suppressed} />
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Contacts ({detail.totalContacts})
          </CardTitle>
          <CardDescription>
            Per-contact outreach status for this list.
            {detail.isArchived
              ? " This list is archived — no new sends will be created."
              : ""}
          </CardDescription>
          <p className="mt-1 text-xs text-muted-foreground/80">
            &ldquo;Sent from mailbox&rdquo; means ODoutreach handed the email to the
            connected mailbox/provider. It does not guarantee inbox placement.
            If no bounce is recorded, the system has not seen a delivery failure.
          </p>
          <p className="mt-1 text-xs text-muted-foreground/80">
            &ldquo;Awaiting send&rdquo; means the contact is eligible and will be
            emailed on the next launch or send run — nothing has been handed to a
            mailbox yet. &ldquo;Queued&rdquo; means the email has already been handed
            to the sender and is waiting to go out. &ldquo;Suppressed / skipped&rdquo;
            contacts will not be emailed — each row shows the reason.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <ListDetailContactTable contacts={detail.contacts} />
        </CardContent>
      </Card>
    </div>
  );
}
