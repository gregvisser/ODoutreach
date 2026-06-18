import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { ContactReadinessBadge } from "@/components/contacts/contact-readiness-badge";
import { buttonVariants } from "@/components/ui/button";
import {
  classifyContactReadiness,
  readinessStatusLabel,
} from "@/lib/client-contacts-readiness";
import { cn } from "@/lib/utils";
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
  CsvImportForm,
  type ClientListOption,
} from "@/app/(app)/contacts/csv-import-form";
import { SendToContactForm } from "@/app/(app)/contacts/send-to-contact-form";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { listContactListsForClient } from "@/server/contacts/contact-lists";
import { listClientsForStaff } from "@/server/queries/clients";
import { listContactsForStaff } from "@/server/queries/contacts";
import { getAccessibleClientIds } from "@/server/tenant/access";

export const dynamic = "force-dynamic";

/**
 * Global Contacts is a legacy admin-only surface (PR #140 — G10).
 *
 * Universe is the canonical cross-client contact warehouse and each
 * client's Sources tab owns imports. Normal staff don't need a
 * cross-client CSV import or per-row send sheet — those are admin /
 * support tools and are routinely confused for the day-to-day flow.
 *
 * Non-admin staff are redirected to `/universe`. Admins still reach
 * the cross-client CSV import + per-row send sheet on this route.
 * The route is intentionally not in the staff sidebar (removed in
 * PR #138; see `src/components/app-shell/nav-config.ts`).
 */

type Props = {
  searchParams?: Promise<{
    client?: string;
    import?: string;
    batch?: string;
    imported?: string;
    skipped?: string;
    uNew?: string;
    uMatch?: string;
    message?: string;
    send?: string;
    id?: string;
    reason?: string;
    list?: string;
  }>;
};

export default async function ContactsPage({ searchParams }: Props) {
  const staff = await requireOpensDoorsStaff();
  if (!staff.isSuperAdmin) {
    redirect("/universe");
  }
  const accessible = await getAccessibleClientIds(staff);
  const sp = (await searchParams) ?? {};
  const rawFilter = sp.client;
  const clientFilter =
    rawFilter && accessible.includes(rawFilter) ? rawFilter : undefined;
  const importBanner =
    sp.import === "ok"
      ? {
          kind: "ok" as const,
          imported: sp.imported,
          skipped: sp.skipped,
          batch: sp.batch,
          list: sp.list,
          uNew: sp.uNew,
          uMatch: sp.uMatch,
        }
      : sp.import === "error"
        ? { kind: "error" as const, message: sp.message }
        : null;

  const sendBanner =
    sp.send === "queued"
      ? { kind: "queued" as const, id: sp.id }
      : sp.send === "sent"
        ? { kind: "queued" as const, id: sp.id }
        : sp.send === "blocked"
          ? { kind: "blocked" as const, id: sp.id, reason: sp.reason }
          : sp.send === "failed"
            ? { kind: "failed" as const, id: sp.id, message: sp.message }
            : sp.send === "error"
              ? { kind: "error" as const, message: sp.message }
              : null;
  const [contacts, clients] = await Promise.all([
    listContactsForStaff(accessible, clientFilter),
    listClientsForStaff(accessible),
  ]);

  // Preload per-client lists so the CSV form can surface an "existing list"
  // picker the moment an operator picks a client workspace in the dropdown.
  const listsByClientIdEntries = await Promise.all(
    clients.map(async (c) => {
      const rows = await listContactListsForClient(c.id);
      const options: ClientListOption[] = rows.map((r) => ({
        id: r.id,
        name: r.name,
        memberCount: r.memberCount,
      }));
      return [c.id, options] as const;
    }),
  );
  const listsByClientId = Object.fromEntries(listsByClientIdEntries);

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <p className="rounded-lg border border-amber-400/40 bg-amber-50/60 px-4 py-3 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200">
        <span className="font-medium">Admin-only legacy tools.</span>{" "}
        The day-to-day contact directory lives on{" "}
        <Link
          href="/universe"
          className="font-medium underline-offset-2 hover:underline"
        >
          Universe
        </Link>
        , and per-client imports live on each client&rsquo;s{" "}
        <span className="font-medium">Sources</span> tab. This page is kept
        only for cross-client CSV import and per-row send tooling that an
        administrator may occasionally need, and is intentionally not in the
        staff sidebar.
      </p>

      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Contacts (admin legacy tools)</h1>
          <p className="mt-1 text-muted-foreground">
            Cross-client contact directory — filter to a single workspace when needed.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Filter:</span>
          <Link
            href="/contacts"
            className={cn(
              buttonVariants({
                variant: !clientFilter ? "secondary" : "outline",
                size: "sm",
              }),
            )}
          >
            All (in scope)
          </Link>
          {clients.map((c) => (
            <Link
              key={c.id}
              href={`/contacts?client=${c.id}`}
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

      <section className="rounded-lg border border-border/80 bg-card p-6 shadow-sm space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Sources
        </p>
        <h2 className="text-xl font-semibold tracking-tight">Import contacts</h2>
        <p className="text-sm text-muted-foreground max-w-3xl">
          Upload a CSV for any workspace you can access, or open a client&apos;s Sources tab for RocketReach.
        </p>
        <p className="text-xs text-muted-foreground">
          Cross-client directory and send tools are below.{" "}
          <Link href="/universe" className="font-medium text-primary underline-offset-2 hover:underline">
            Universe
          </Link>{" "}
          lists every imported person you can filter and attach to client lists.
        </p>
      </section>

      <CsvImportForm
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
        listsByClientId={listsByClientId}
      />

      {importBanner?.kind === "ok" ? (
        <p className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          Import finished — created{" "}
          <span className="font-medium">{importBanner.imported ?? "0"}</span>, skipped{" "}
          <span className="font-medium">{importBanner.skipped ?? "0"}</span>
          {importBanner.list ? (
            <>
              {" "}
              into list{" "}
              <span className="font-medium">{importBanner.list}</span>
            </>
          ) : null}
          {importBanner.batch ? (
            <>
              {" "}
              (batch <span className="font-mono text-xs">{importBanner.batch}</span>)
            </>
          ) : null}
          .
          {importBanner.uNew != null || importBanner.uMatch != null ? (
            <>
              {" "}
              Universe:{" "}
              <span className="font-medium">{importBanner.uNew ?? "0"}</span> new,{" "}
              <span className="font-medium">{importBanner.uMatch ?? "0"}</span> matched existing.
            </>
          ) : null}
        </p>
      ) : null}
      {importBanner?.kind === "error" ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Import failed: {importBanner.message ?? "Unknown error"}
        </p>
      ) : null}

      {sendBanner?.kind === "queued" ? (
        <p className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          Send queued for delivery — the worker picks it up shortly (check Activity for status:
          queued → processing → sent).
          {sendBanner.id ? (
            <>
              {" "}
              <Link
                className="font-medium underline underline-offset-2"
                href={`/activity/outbound/${sendBanner.id}`}
              >
                View outbound record
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
      {sendBanner?.kind === "blocked" ? (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          Send blocked by suppression
          {sendBanner.reason ? (
            <span className="text-muted-foreground"> ({sendBanner.reason})</span>
          ) : null}
          {sendBanner.id ? (
            <>
              .{" "}
              <Link
                className="font-medium underline underline-offset-2"
                href={`/activity/outbound/${sendBanner.id}`}
              >
                View outbound record
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
      {sendBanner?.kind === "failed" ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Send failed: {sendBanner.message ?? "Unknown error"}
          {sendBanner.id ? (
            <>
              {" "}
              <Link
                className="font-medium underline underline-offset-2"
                href={`/activity/outbound/${sendBanner.id}`}
              >
                View record
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
      {sendBanner?.kind === "error" ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {sendBanner.message ?? "Could not send."}
        </p>
      ) : null}

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Directory</CardTitle>
          <CardDescription>
            Suppression flags are recomputed after imports and sheet syncs. Sending flows
            must call <code className="rounded bg-muted px-1 text-xs">evaluateSuppression</code>{" "}
            before enqueue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Import</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Send</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.map((row) => {
                const nameLabel =
                  row.fullName ||
                  [row.firstName, row.lastName].filter(Boolean).join(" ");
                // PR F1: email can be null. Fall back to "—" in the cell
                // and to a friendly label for the send sheet so the
                // operator still sees a human identifier.
                const contactLabel =
                  nameLabel || row.email || "Unnamed contact";
                // PR F3: classify every row using the canonical readiness
                // helper so the Status column tells the operator whether
                // this contact is email-sendable, valid-no-email, suppressed,
                // or missing every identifier — instead of a generic Yes/No
                // suppression chip that hid the null-email case.
                const status = readinessStatusLabel(
                  classifyContactReadiness({
                    email: row.email,
                    linkedIn: row.linkedIn,
                    mobilePhone: row.mobilePhone,
                    officePhone: row.officePhone,
                    isSuppressed: row.isSuppressed,
                  }),
                );
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      {row.email ?? (
                        <span
                          className="text-xs text-muted-foreground"
                          title="No email address on file — this contact cannot be reached by email."
                        >
                          No email
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {nameLabel || "—"}
                    </TableCell>
                    <TableCell>{row.client.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.source}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.importBatch?.fileName ?? "—"}
                    </TableCell>
                    <TableCell>
                      <ContactReadinessBadge status={status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <SendToContactForm
                        clientId={row.clientId}
                        contactId={row.id}
                        toEmail={row.email}
                        contactLabel={contactLabel}
                        isSuppressed={row.isSuppressed}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {contacts.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No contacts in scope — import a CSV or adjust access.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
