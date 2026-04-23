import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { ContactReadinessBadge } from "@/components/contacts/contact-readiness-badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  MISSING_EMAIL_KPI_DISPLAY,
  MISSING_IDENTIFIER_KPI_DISPLAY,
} from "@/lib/contacts/contact-status-display";
import { cn } from "@/lib/utils";
import { requireStaffUser } from "@/server/auth/staff";
import { loadClientListsOverview } from "@/server/contacts/contact-lists-view";
import type { ListStatusLabel } from "@/server/contacts/contact-lists-view-model";
import { getClientByIdForStaff } from "@/server/queries/clients";
import { getAccessibleClientIds } from "@/server/tenant/access";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ clientId: string }>;
};

const DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return DATE_FORMATTER.format(date);
}

function listStatusBadgeVariant(
  status: ListStatusLabel,
): "default" | "secondary" | "outline" {
  switch (status) {
    case "ready_for_sequence":
      return "default";
    case "needs_email_sendable":
      return "secondary";
    case "needs_contacts":
      return "outline";
  }
}

function listStatusLabel(status: ListStatusLabel): string {
  switch (status) {
    case "ready_for_sequence":
      return "Ready to use";
    case "needs_email_sendable":
      return "Needs emails";
    case "needs_contacts":
      return "Empty";
  }
}

type KpiTile = {
  id: string;
  label: string;
  value: number;
  hint: string;
  tone: "primary" | "muted" | "warning" | "danger";
};

const TONE_STYLES: Record<KpiTile["tone"], string> = {
  primary: "border-primary/30 bg-primary/5",
  muted: "border-border/80 bg-background",
  warning: "border-amber-500/40 bg-amber-500/5",
  danger: "border-destructive/30 bg-destructive/5",
};

export default async function ClientContactsPage({ params }: Props) {
  const staff = await requireStaffUser();
  const accessible = await getAccessibleClientIds(staff);
  const { clientId } = await params;

  const client = await getClientByIdForStaff(clientId, accessible);
  if (!client) notFound();

  const overview = await loadClientListsOverview(client.id);
  const { lists, totals } = overview;

  const base = `/clients/${client.id}`;

  const kpis: KpiTile[] = [
    {
      id: "total-lists",
      label: "Total lists",
      value: totals.totalLists,
      hint: "Contact lists attached to this client.",
      tone: "muted",
    },
    {
      id: "total-members",
      label: "Unique contacts",
      value: totals.uniqueContacts.total,
      hint: "Across every list — counted once.",
      tone: "muted",
    },
    {
      id: "email-sendable",
      label: "Ready to email",
      value: totals.uniqueContacts.emailSendable,
      hint: "Have a valid email address.",
      tone: "primary",
    },
    {
      id: "suppressed",
      label: "Suppressed",
      value: totals.uniqueContacts.suppressed,
      hint: "Blocked by this client's rules.",
      tone: "danger",
    },
    {
      id: "missing-email",
      label: MISSING_EMAIL_KPI_DISPLAY.label,
      value: totals.uniqueContacts.missingEmail,
      hint: MISSING_EMAIL_KPI_DISPLAY.tooltip,
      tone: "warning",
    },
    {
      id: "missing-identifier",
      label: MISSING_IDENTIFIER_KPI_DISPLAY.label,
      value: totals.uniqueContacts.missingOutreachIdentifier,
      hint: MISSING_IDENTIFIER_KPI_DISPLAY.tooltip,
      tone: "warning",
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Contacts
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Contact lists</h1>
          <p className="mt-1 max-w-3xl text-muted-foreground">
            Lists of contacts for{" "}
            <span className="font-medium text-foreground">{client.name}</span>.
            Each import is saved to a list, and every sequence sends to one
            list you choose.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`${base}/sources`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Open sources
          </Link>
          <Link
            href={`${base}/outreach`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Open outreach
          </Link>
          <Link
            href={`${base}/suppression`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Open suppression
          </Link>
        </div>
      </div>

      <section
        aria-label="Email list readiness KPIs"
        className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"
      >
        {kpis.map((kpi) => (
          <div
            key={kpi.id}
            className={cn(
              "rounded-lg border px-4 py-3 shadow-sm",
              TONE_STYLES[kpi.tone],
            )}
          >
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {kpi.label}
            </p>
            <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
              {kpi.value}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{kpi.hint}</p>
          </div>
        ))}
      </section>

      {lists.length === 0 ? (
        <Card className="border-dashed border-border/80 bg-muted/30 shadow-sm">
          <CardHeader>
            <CardTitle>No contact lists yet</CardTitle>
            <CardDescription>
              This client doesn&rsquo;t have any lists. Head over to Sources
              to import contacts — the import will create a list and fill it
              with the contacts you bring in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href={`${base}/sources`}
              className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
            >
              Import contacts
            </Link>
          </CardContent>
        </Card>
      ) : (
        <section
          aria-label="Email lists"
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
        >
          {lists.map((list) => {
            const readiness = list.readiness;
            return (
              <Card
                key={list.id}
                className="flex h-full flex-col border-border/80 shadow-sm"
              >
                <CardHeader className="space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <CardTitle className="break-words text-lg leading-tight">
                      {list.name}
                    </CardTitle>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={listStatusBadgeVariant(list.statusLabel)}>
                        {listStatusLabel(list.statusLabel)}
                      </Badge>
                      {list.hasSuppression ? (
                        <Badge variant="destructive">
                          {readiness.suppressed} suppressed
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  {list.description ? (
                    <CardDescription className="break-words">
                      {list.description}
                    </CardDescription>
                  ) : null}
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <div>
                      <dt className="font-medium uppercase tracking-wider">
                        Members
                      </dt>
                      <dd className="tabular-nums text-foreground">
                        {list.memberCount}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium uppercase tracking-wider">
                        Updated
                      </dt>
                      <dd className="text-foreground">
                        {formatDate(list.updatedAt)}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium uppercase tracking-wider">
                        Created
                      </dt>
                      <dd className="text-foreground">
                        {formatDate(list.createdAt)}
                      </dd>
                    </div>
                    {list.createdByName ? (
                      <div>
                        <dt className="font-medium uppercase tracking-wider">
                          By
                        </dt>
                        <dd
                          className="truncate text-foreground"
                          title={list.createdByName}
                        >
                          {list.createdByName}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-4">
                  <dl className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md border border-primary/30 bg-primary/5 px-2 py-1.5">
                      <dt className="font-medium uppercase tracking-wider text-muted-foreground">
                        Ready to email
                      </dt>
                      <dd className="text-base font-semibold tabular-nums">
                        {readiness.emailSendable}
                      </dd>
                    </div>
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5">
                      <dt className="font-medium uppercase tracking-wider text-muted-foreground">
                        Suppressed
                      </dt>
                      <dd className="text-base font-semibold tabular-nums">
                        {readiness.suppressed}
                      </dd>
                    </div>
                    <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-2 py-1.5">
                      <dt className="font-medium uppercase tracking-wider text-muted-foreground">
                        Missing email
                      </dt>
                      <dd className="text-base font-semibold tabular-nums">
                        {readiness.missingEmail}
                      </dd>
                    </div>
                    <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-2 py-1.5">
                      <dt className="font-medium uppercase tracking-wider text-muted-foreground">
                        Missing identifier
                      </dt>
                      <dd className="text-base font-semibold tabular-nums">
                        {readiness.missingOutreachIdentifier}
                      </dd>
                    </div>
                  </dl>

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Recent members
                    </p>
                    {list.recentMembers.length === 0 ? (
                      <p className="rounded-md border border-dashed border-border/80 bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
                        No contacts in this list yet. Contacts appear here
                        after your next import into this list.
                      </p>
                    ) : (
                      <ul className="divide-y divide-border/60 rounded-md border border-border/80">
                        {list.recentMembers.map((member) => (
                          <li
                            key={member.id}
                            className="flex flex-col gap-1 px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="min-w-0 flex-1">
                              <p
                                className="truncate font-medium text-foreground"
                                title={member.displayName}
                              >
                                {member.displayName}
                              </p>
                              <p
                                className="truncate text-muted-foreground"
                                title={
                                  [member.company, member.email]
                                    .filter(Boolean)
                                    .join(" · ") || undefined
                                }
                              >
                                {[member.company, member.email]
                                  .filter(Boolean)
                                  .join(" · ") || "—"}
                              </p>
                            </div>
                            <ContactReadinessBadge
                              status={member.status}
                              className="self-start sm:self-center"
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="mt-auto flex flex-wrap gap-2 pt-2">
                    <Link
                      href={`${base}/sources`}
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                      )}
                    >
                      Open sources
                    </Link>
                    <Link
                      href={`${base}/outreach`}
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                      )}
                    >
                      Open outreach
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </section>
      )}

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>How these counts work</CardTitle>
          <CardDescription>
            Lists are the building block for outreach. Each sequence sends to
            exactly one list.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-6 text-sm text-muted-foreground">
            <li>
              Readiness is based on contact details — email, LinkedIn, mobile,
              and office phone.
            </li>
            <li>
              The numbers at the top count each contact once, even if they
              appear in several lists.
            </li>
            <li>
              This page is read-only. Import contacts from the{" "}
              <Link
                href={`${base}/sources`}
                className="underline underline-offset-2"
              >
                Sources
              </Link>{" "}
              tab.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
