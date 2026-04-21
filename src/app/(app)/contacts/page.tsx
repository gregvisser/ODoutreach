import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
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
import { requireStaffUser } from "@/server/auth/staff";
import { listContactListsForClient } from "@/server/contacts/contact-lists";
import { listClientsForStaff } from "@/server/queries/clients";
import { listContactsForStaff } from "@/server/queries/contacts";
import { getAccessibleClientIds } from "@/server/tenant/access";

export const dynamic = "force-dynamic";

type Props = {
  searchParams?: Promise<{
    client?: string;
    import?: string;
    batch?: string;
    imported?: string;
    skipped?: string;
    message?: string;
    send?: string;
    id?: string;
    reason?: string;
    list?: string;
  }>;
};

export default async function ContactsPage({ searchParams }: Props) {
  const staff = await requireStaffUser();
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
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Contacts</h1>
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
                <TableHead>Suppressed</TableHead>
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
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      {row.email ?? (
                        <span className="text-xs text-muted-foreground">
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
                      {row.isSuppressed ? (
                        <span className="space-y-0.5">
                          <Badge variant="destructive">Yes</Badge>
                          <p className="text-[10px] text-muted-foreground">
                            email/domain list
                          </p>
                        </span>
                      ) : (
                        <Badge variant="secondary">No</Badge>
                      )}
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
