import Link from "next/link";

import { runSuppressionSyncAction } from "@/app/(app)/suppression/actions";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { suppressionKindLabel } from "@/lib/suppression/staff-labels";
import { hasGoogleServiceAccountConfig } from "@/server/integrations/google-sheets/auth";
import { getGoogleServiceAccountDisplayInfo } from "@/server/integrations/google-sheets/service-account-display";
import { GoogleSheetsSharingCallout } from "@/components/suppression/google-sheets-sharing-callout";
import { SuppressionSourcesInspectableTable } from "@/components/suppression/suppression-sources-inspectable-table";
import { SuppressionRowsInspectableTable } from "@/components/suppression/suppression-rows-inspectable-table";
import { requireStaffUser } from "@/server/auth/staff";
import { listClientsForStaff } from "@/server/queries/clients";
import {
  listSuppressedDomainsForStaff,
  listSuppressedEmailsForStaff,
  listSuppressionSourcesForStaff,
} from "@/server/queries/suppression";
import { getAccessibleClientIds } from "@/server/tenant/access";

export const dynamic = "force-dynamic";

type Props = {
  searchParams?: Promise<{
    client?: string;
    sync?: string;
    rows?: string;
    message?: string;
    emailQ?: string;
    emailFrom?: string;
    domainQ?: string;
    domainFrom?: string;
  }>;
};

/** A `?...From=` param is a row offset; anything that is not a whole number is 0. */
function parseOffset(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export default async function SuppressionPage({ searchParams }: Props) {
  const staff = await requireStaffUser();
  const accessible = await getAccessibleClientIds(staff);
  const sp = (await searchParams) ?? {};
  const rawFilter = sp.client;
  const clientFilter =
    rawFilter && accessible.includes(rawFilter) ? rawFilter : undefined;

  const emailSearch = sp.emailQ?.trim() ?? "";
  const domainSearch = sp.domainQ?.trim() ?? "";
  const emailOffset = parseOffset(sp.emailFrom);
  const domainOffset = parseOffset(sp.domainFrom);

  const [sources, emails, domains, clients] = await Promise.all([
    listSuppressionSourcesForStaff(accessible, clientFilter),
    listSuppressedEmailsForStaff({
      accessibleClientIds: accessible,
      filterClientId: clientFilter,
      search: emailSearch,
      offset: emailOffset,
    }),
    listSuppressedDomainsForStaff({
      accessibleClientIds: accessible,
      filterClientId: clientFilter,
      search: domainSearch,
      offset: domainOffset,
    }),
    listClientsForStaff(accessible),
  ]);

  /**
   * Each table's links and search form must carry the page's other state, or
   * paging the domain list would silently clear a search running on the email
   * list. Built once here so the two tables cannot disagree.
   */
  function carryParamsFor(table: "email" | "domain"): Record<string, string> {
    const carried: Record<string, string> = {};
    if (clientFilter) carried.client = clientFilter;
    if (table === "email") {
      if (domainSearch) carried.domainQ = domainSearch;
      if (domainOffset > 0) carried.domainFrom = String(domainOffset);
    } else {
      if (emailSearch) carried.emailQ = emailSearch;
      if (emailOffset > 0) carried.emailFrom = String(emailOffset);
    }
    return carried;
  }

  const googleReady = hasGoogleServiceAccountConfig();
  const googleSaDisplay = getGoogleServiceAccountDisplayInfo();
  const syncBanner =
    sp.sync === "ok"
      ? { kind: "ok" as const, rows: sp.rows }
      : sp.sync === "error"
        ? { kind: "error" as const, message: sp.message }
        : null;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Do-not-contact
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">People blocked from outreach</h1>
          <p className="mt-1 max-w-3xl text-muted-foreground">
            Email addresses and whole domains that must never receive outreach.
            Each source applies only to its own client workspace, and every
            send checks this list before queueing.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link prefetch={false}
            href="/suppression"
            className={cn(
              buttonVariants({
                variant: !clientFilter ? "secondary" : "outline",
                size: "sm",
              }),
            )}
          >
            All
          </Link>
          {clients.map((c) => (
            <Link prefetch={false}
              key={c.id}
              href={`/suppression?client=${c.id}`}
              className={cn(
                buttonVariants({
                  variant: clientFilter === c.id ? "secondary" : "outline",
                  size: "sm",
                }),
              )}
            >
              {c.name}
            </Link>
          ))}
        </div>
      </div>

      {syncBanner?.kind === "ok" ? (
        <p className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          Sync finished — wrote{" "}
          <span className="font-medium">{syncBanner.rows ?? "0"}</span> row(s). Contact
          do-not-contact flags were refreshed.
        </p>
      ) : null}
      {syncBanner?.kind === "error" ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Sync failed: {syncBanner.message ?? "Unknown error"}
        </p>
      ) : null}

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>How do-not-contact works</CardTitle>
          <CardDescription>
            Every send checks this list. Anyone on it is silently skipped.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-6 text-sm text-muted-foreground">
            <li>
              <span className="text-foreground">Manual lists</span> — email
              addresses and whole domains pulled from each client&rsquo;s
              connected Google Sheet.
            </li>
            <li>
              <span className="text-foreground">Unsubscribes</span> — anyone
              who clicks the unsubscribe link in a sequence email is added
              automatically.
            </li>
            <li>
              <span className="text-foreground">Bounces and provider blocks</span>{" "}
              — hard bounces and provider-rejected sends mark the address as
              blocked.
            </li>
            <li>
              <span className="text-foreground">Per-client safety rules</span>{" "}
              — each client&rsquo;s own brief or list can also flag people
              not to contact.
            </li>
          </ul>
        </CardContent>
      </Card>

      <details className="rounded-lg border border-dashed border-border/80 bg-muted/10 px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">
          How sheet syncing is connected
        </summary>
        <Card className="mt-3 border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle>Google Sheets connection</CardTitle>
            <CardDescription>
              OpensDoors reads each client&apos;s Google Sheet through one shared
              account. Share every Sheet (Viewer access) with the address below.
              The one-time account setup is handled by your administrator.
              {googleReady ? (
                <span className="text-foreground"> Connected and ready.</span>
              ) : (
                <span className="text-amber-700 dark:text-amber-400">
                  {" "}
                  Not connected yet — ask your administrator to finish setup.
                </span>
              )}
            </CardDescription>
          </CardHeader>
          {googleReady && googleSaDisplay.clientEmail ? (
            <CardContent className="pt-0">
              <GoogleSheetsSharingCallout
                serviceAccountEmail={googleSaDisplay.clientEmail}
                idPrefix="suppression-integration"
              />
            </CardContent>
          ) : null}
        </Card>
      </details>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Connected do-not-contact sheets</CardTitle>
          <CardDescription>
            Each client&rsquo;s linked Google Sheets — read-only scope. Click
            Sync to pull the latest rows.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SuppressionSourcesInspectableTable
            sources={sources.map((s) => ({
              id: s.id,
              kind: s.kind,
              spreadsheetId: s.spreadsheetId,
              sheetRange: s.sheetRange,
              syncStatus: s.syncStatus,
              lastError: s.lastError,
              client: { id: s.client.id, name: s.client.name },
              _count: {
                suppressedEmails: s._count.suppressedEmails,
                suppressedDomains: s._count.suppressedDomains,
              },
            }))}
            runSuppressionSyncAction={runSuppressionSyncAction}
            canSync
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle>{suppressionKindLabel("EMAIL")}</CardTitle>
            <CardDescription>
              Individual addresses blocked from outreach. The latest sync
              replaces the rows for that sheet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SuppressionRowsInspectableTable
              valueLabel="Email"
              noun={{
                one: "blocked email address",
                many: "blocked email addresses",
              }}
              rows={emails.rows.map((e) => ({
                id: e.id,
                value: e.email,
                clientName: e.client.name,
              }))}
              total={emails.total}
              pageSize={emails.pageSize}
              offset={emails.offset}
              search={emailSearch}
              paramPrefix="email"
              carryParams={carryParamsFor("email")}
            />
          </CardContent>
        </Card>
        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle>{suppressionKindLabel("DOMAIN")}</CardTitle>
            <CardDescription>
              Whole domains blocked from outreach — anyone whose email ends in
              one of these is silently skipped.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SuppressionRowsInspectableTable
              valueLabel="Domain"
              noun={{ one: "blocked domain", many: "blocked domains" }}
              rows={domains.rows.map((d) => ({
                id: d.id,
                value: d.domain,
                clientName: d.client.name,
              }))}
              total={domains.total}
              pageSize={domains.pageSize}
              offset={domains.offset}
              search={domainSearch}
              paramPrefix="domain"
              carryParams={carryParamsFor("domain")}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
