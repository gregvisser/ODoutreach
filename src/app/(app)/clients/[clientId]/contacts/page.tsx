import Link from "next/link";
import { notFound } from "next/navigation";

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
  MISSING_EMAIL_KPI_DISPLAY,
  MISSING_IDENTIFIER_KPI_DISPLAY,
} from "@/lib/contacts/contact-status-display";
import {
  rocketReachConnectionStatus,
  rocketReachStatusBadgeTone,
} from "@/lib/clients/rocketreach-status";
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
  const rocketReachStatus = rocketReachConnectionStatus(!!process.env.ROCKETREACH_API_KEY?.trim());

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
            Lists
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Lists &amp; readiness</h1>
          <p className="mt-1 max-w-3xl text-muted-foreground">
            Contact lists for{" "}
            <span className="font-medium text-foreground">{client.name}</span>.
            Each import creates a list, every sequence sends to one list, and
            the readiness counts below tell you how many people can actually
            be reached. To add people use{" "}
            <Link
              href={`${base}/sources`}
              className="font-medium text-primary underline underline-offset-2"
            >
              Sources
            </Link>
            .
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

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Import contacts</CardTitle>
              <CardDescription>
                Bring contacts into this workspace from RocketReach or CSV, then
                choose the finished list when you build an outreach sequence.
              </CardDescription>
            </div>
            <Badge variant={rocketReachStatusBadgeTone(rocketReachStatus.status)}>
              RocketReach {rocketReachStatus.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {rocketReachStatus.description}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`${base}/sources#rocketreach-import`}
              className={cn(buttonVariants({ variant: "default", size: "sm" }))}
            >
              Import from RocketReach
            </Link>
            <Link
              href={`/contacts?client=${client.id}`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Import CSV
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">
            CSV import has a preview step before saving. RocketReach writes only
            after an operator submits the import form on Sources.
          </p>
        </CardContent>
      </Card>

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
        <Card className="border-border/80 shadow-sm">
          <CardContent className="overflow-x-auto p-0">
            <table
              aria-label="Email lists"
              className="w-full text-left text-sm"
            >
              <thead>
                <tr className="border-b text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5">List</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5 text-right">Members</th>
                  <th className="px-3 py-2.5 text-right">Ready to email</th>
                  <th className="px-3 py-2.5 text-right">Suppressed</th>
                  <th className="px-3 py-2.5 text-right">Missing email</th>
                  <th className="px-3 py-2.5 text-right">Missing identifier</th>
                  <th className="px-3 py-2.5">Updated</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {lists.map((list) => {
                  const readiness = list.readiness;
                  return (
                    <tr key={list.id} className="align-top hover:bg-muted/40">
                      <td className="px-4 py-3">
                        <Link
                          href={`${base}/lists/${list.id}`}
                          className="font-medium text-foreground underline-offset-2 hover:underline"
                        >
                          {list.name}
                        </Link>
                        {list.description ? (
                          <p
                            className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground"
                            title={list.description}
                          >
                            {list.description}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-1">
                          <Badge variant={listStatusBadgeVariant(list.statusLabel)}>
                            {listStatusLabel(list.statusLabel)}
                          </Badge>
                          {list.hasSuppression ? (
                            <Badge variant="destructive">
                              {readiness.suppressed} suppressed
                            </Badge>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {list.memberCount}
                      </td>
                      <td className="px-3 py-3 text-right font-medium tabular-nums">
                        {readiness.emailSendable}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {readiness.suppressed}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {readiness.missingEmail}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {readiness.missingOutreachIdentifier}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                        {formatDate(list.updatedAt)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-1.5 whitespace-nowrap">
                          <Link
                            href={`${base}/lists/${list.id}`}
                            className={cn(buttonVariants({ variant: "default", size: "xs" }))}
                          >
                            Open
                          </Link>
                          <Link
                            href={`${base}/sources`}
                            className={cn(buttonVariants({ variant: "outline", size: "xs" }))}
                          >
                            Sources
                          </Link>
                          <Link
                            href={`${base}/outreach`}
                            className={cn(buttonVariants({ variant: "outline", size: "xs" }))}
                          >
                            Outreach
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
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
