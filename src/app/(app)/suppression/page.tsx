import Link from "next/link";

import { runSuppressionSyncAction } from "@/app/(app)/suppression/actions";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { hasGoogleServiceAccountConfig } from "@/server/integrations/google-sheets/auth";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  }>;
};

export default async function SuppressionPage({ searchParams }: Props) {
  const staff = await requireStaffUser();
  const accessible = await getAccessibleClientIds(staff);
  const sp = (await searchParams) ?? {};
  const rawFilter = sp.client;
  const clientFilter =
    rawFilter && accessible.includes(rawFilter) ? rawFilter : undefined;
  const [sources, emails, domains, clients] = await Promise.all([
    listSuppressionSourcesForStaff(accessible, clientFilter),
    listSuppressedEmailsForStaff(accessible, clientFilter),
    listSuppressedDomainsForStaff(accessible, clientFilter),
    listClientsForStaff(accessible),
  ]);

  const googleReady = hasGoogleServiceAccountConfig();
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
          <h1 className="text-3xl font-semibold tracking-tight">Suppression lists</h1>
          <p className="mt-1 text-muted-foreground">
            Google Sheets are the source of truth. Each source syncs only into its own
            client workspace — never cross-tenant.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
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
            <Link
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
          suppression flags were refreshed.
        </p>
      ) : null}
      {syncBanner?.kind === "error" ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Sync failed: {syncBanner.message ?? "Unknown error"}
        </p>
      ) : null}

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Integration status</CardTitle>
          <CardDescription>
            Share each spreadsheet with the Google service account email from your JSON key.
            Env:{" "}
            <code className="rounded bg-muted px-1 text-xs">
              GOOGLE_SERVICE_ACCOUNT_JSON
            </code>{" "}
            or{" "}
            <code className="rounded bg-muted px-1 text-xs">
              GOOGLE_SERVICE_ACCOUNT_JSON_BASE64
            </code>
            .{googleReady ? (
              <span className="text-foreground"> Credentials detected.</span>
            ) : (
              <span className="text-amber-700 dark:text-amber-400">
                {" "}
                Not configured — sync will fail until set.
              </span>
            )}
          </CardDescription>
        </CardHeader>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Sheet connections</CardTitle>
          <CardDescription>
            Email vs domain lists — trigger a pull from Google (read-only scope).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Spreadsheet</TableHead>
                <TableHead>Range</TableHead>
                <TableHead>Sync</TableHead>
                <TableHead className="text-right">Rows</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.client.name}</TableCell>
                  <TableCell>
                    <Badge variant={s.kind === "EMAIL" ? "default" : "secondary"}>
                      {s.kind}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate font-mono text-xs">
                    {s.spreadsheetId ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-[140px] truncate font-mono text-xs">
                    {s.sheetRange ?? "Sheet1!A1:Z50000"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{s.syncStatus}</Badge>
                    {s.lastError ? (
                      <p className="mt-1 max-w-[200px] truncate text-[10px] text-destructive">
                        {s.lastError}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {s.kind === "EMAIL"
                      ? s._count.suppressedEmails
                      : s._count.suppressedDomains}
                  </TableCell>
                  <TableCell>
                    <form action={runSuppressionSyncAction}>
                      <input type="hidden" name="sourceId" value={s.id} />
                      <Button type="submit" size="sm" variant="outline">
                        Sync
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {sources.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No sources configured for accessible workspaces.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle>Suppressed emails</CardTitle>
            <CardDescription>Last sync replaces rows for that sheet source</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Client</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {emails.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono text-sm">{e.email}</TableCell>
                    <TableCell>{e.client.name}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle>Suppressed domains</CardTitle>
            <CardDescription>Normalized domains from the domain sheet</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domain</TableHead>
                  <TableHead>Client</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {domains.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono text-sm">{d.domain}</TableCell>
                    <TableCell>{d.client.name}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
