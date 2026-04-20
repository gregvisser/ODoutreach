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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  classifyContactReadiness,
  readinessStatusLabel,
  summarizeContactReadiness,
  type ContactIdentifierFields,
  type ContactReadinessStatusLabel,
} from "@/lib/client-contacts-readiness";
import { cn } from "@/lib/utils";
import { requireStaffUser } from "@/server/auth/staff";
import { getClientByIdForStaff } from "@/server/queries/clients";
import { listContactsForStaff } from "@/server/queries/contacts";
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

function formatSource(source: string): string {
  switch (source) {
    case "CSV_IMPORT":
      return "CSV";
    case "ROCKETREACH":
      return "RocketReach";
    case "MANUAL":
      return "Manual";
    default:
      return source;
  }
}

function statusBadgeVariant(
  status: ContactReadinessStatusLabel,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "email_sendable":
      return "default";
    case "valid_no_email":
      return "secondary";
    case "suppressed":
      return "destructive";
    case "missing_identifier":
      return "outline";
  }
}

function statusBadgeLabel(status: ContactReadinessStatusLabel): string {
  switch (status) {
    case "email_sendable":
      return "Email-sendable";
    case "valid_no_email":
      return "Valid, no email";
    case "suppressed":
      return "Suppressed";
    case "missing_identifier":
      return "Missing identifier";
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

  const rows = await listContactsForStaff(accessible, clientId);

  const readinessInputs: ContactIdentifierFields[] = rows.map((row) => ({
    email: row.email,
    // LinkedIn / mobile / office phone are not yet first-class on `Contact`;
    // PR C (import contract) adds them. The helper safely treats undefined
    // as "not provided".
    isSuppressed: row.isSuppressed,
  }));
  const summary = summarizeContactReadiness(readinessInputs);

  const base = `/clients/${client.id}`;

  const kpis: KpiTile[] = [
    {
      id: "total",
      label: "Total contacts",
      value: summary.total,
      hint: "All contacts imported for this client.",
      tone: "muted",
    },
    {
      id: "valid",
      label: "Valid",
      value: summary.valid,
      hint: "Not suppressed and has at least one outreach identifier.",
      tone: "primary",
    },
    {
      id: "email-sendable",
      label: "Email-sendable",
      value: summary.emailSendable,
      hint: "Valid contacts with an email address.",
      tone: "primary",
    },
    {
      id: "suppressed",
      label: "Suppressed",
      value: summary.suppressed,
      hint: "Excluded by client suppression rules.",
      tone: "danger",
    },
    {
      id: "missing-email",
      label: "Missing email",
      value: summary.missingEmail,
      hint: "Not suppressed, but no email address stored.",
      tone: "warning",
    },
    {
      id: "missing-identifier",
      label: "Missing identifier",
      value: summary.missingOutreachIdentifier,
      hint: "No email, LinkedIn, mobile, or office phone stored.",
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
          <h1 className="text-3xl font-semibold tracking-tight">{client.name}</h1>
          <p className="mt-1 max-w-3xl text-muted-foreground">
            Client-scoped contacts for outreach readiness. A contact is
            email-sendable only when it has an email address and is not
            suppressed.
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
            href={`${base}/suppression`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Open suppression
          </Link>
          <Link
            href={`${base}/outreach`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Open outreach
          </Link>
        </div>
      </div>

      <section
        aria-label="Contact readiness KPIs"
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
          <CardTitle>Contact readiness rules</CardTitle>
          <CardDescription>
            These rules decide whether a contact is eligible for outreach in
            this workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-border/80 bg-muted/40 px-3 py-2">
              <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Valid contact
              </dt>
              <dd className="mt-1 text-sm">
                Not suppressed and has at least one outreach identifier: email,
                LinkedIn, mobile, or office phone.
              </dd>
            </div>
            <div className="rounded-md border border-border/80 bg-muted/40 px-3 py-2">
              <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Email-sendable
              </dt>
              <dd className="mt-1 text-sm">Valid contact with an email address.</dd>
            </div>
            <div className="rounded-md border border-border/80 bg-muted/40 px-3 py-2">
              <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Suppressed
              </dt>
              <dd className="mt-1 text-sm">
                Excluded by client suppression rules (email or domain list).
              </dd>
            </div>
            <div className="rounded-md border border-border/80 bg-muted/40 px-3 py-2">
              <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Missing outreach identifier
              </dt>
              <dd className="mt-1 text-sm">
                No email, LinkedIn, mobile, or office phone currently stored.
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">
            Today only <code className="rounded bg-muted px-1">email</code> and
            suppression state are stored per contact; LinkedIn, mobile, and
            office phone become first-class fields in the PR C import contract
            (CSV + RocketReach headings). Counts above reflect identifiers
            available in the current model — they are never inferred.
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Client contacts</CardTitle>
          <CardDescription>
            Scoped to <span className="font-medium">{client.name}</span>. Up to
            500 most recently updated contacts are shown.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="space-y-3 rounded-md border border-dashed border-border/80 bg-muted/40 p-6 text-center">
              <p className="text-sm">
                No contacts for this client yet.
              </p>
              <p className="text-sm text-muted-foreground">
                Import contacts from Sources, then return here to review
                validity and email-sendable counts.
              </p>
              <div className="flex justify-center">
                <Link
                  href={`${base}/sources`}
                  className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
                >
                  Open sources
                </Link>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Imported</TableHead>
                    <TableHead className="hidden md:table-cell">Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const readiness = classifyContactReadiness({
                      email: row.email,
                      isSuppressed: row.isSuppressed,
                    });
                    const status = readinessStatusLabel(readiness);
                    const displayName =
                      row.fullName?.trim() ||
                      [row.firstName, row.lastName].filter(Boolean).join(" ") ||
                      "—";
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{displayName}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {row.company?.trim() || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {row.title?.trim() || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {row.email || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusBadgeVariant(status)}>
                            {statusBadgeLabel(status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{formatSource(row.source)}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {row.importBatch?.fileName?.trim() || "—"}
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground md:table-cell">
                          {formatDate(row.updatedAt)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <p className="mt-4 text-xs text-muted-foreground">
                LinkedIn, mobile, and office phone columns will appear here once
                the PR C import contract lands. This page does not trigger
                imports, sends, or suppression sync.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
