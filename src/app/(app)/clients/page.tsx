import Link from "next/link";

import { ClientLogo } from "@/components/clients/client-logo";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { clientStatusBadgeClassName, clientStatusLabel } from "@/lib/ui/status-labels";
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
import { resolveClientsPageEmptyCopy } from "@/lib/clients/clients-page-empty-state";
import { prisma } from "@/lib/db";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { listClientsForStaff } from "@/server/queries/clients";
import { getAccessibleClientIds } from "@/server/tenant/access";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const staff = await requireOpensDoorsStaff();
  const accessible = await getAccessibleClientIds(staff);
  // listClientsForStaff needs `accessible`; the total count does not —
  // run them concurrently instead of one after another.
  const [clients, totalClientsInDatabase] = await Promise.all([
    listClientsForStaff(accessible),
    // F2: exclude soft-deleted workspaces from the "exists but you can't see it" hint.
    prisma.client.count({ where: { deletedAt: null } }),
  ]);
  const emptyCopy = resolveClientsPageEmptyCopy({
    listedClientCount: clients.length,
    totalClientsInDatabase,
  });

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Clients</h1>
          <p className="mt-1 text-muted-foreground">
            The client workspaces you can access. Each client keeps its own
            contacts, mailboxes, and outreach.
          </p>
        </div>
        <Link prefetch={false} href="/clients/new" className={cn(buttonVariants())}>
          Add client
        </Link>
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>All clients</CardTitle>
          <CardDescription>Current status and live totals.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Contacts</TableHead>
                <TableHead className="text-right">Sequences</TableHead>
                <TableHead className="w-[120px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-3">
                      <ClientLogo
                        clientName={c.name}
                        logoUrl={c.logoUrl}
                        logoAltText={c.logoAltText}
                        size={32}
                      />
                      <span className="min-w-0 truncate">{c.name}</span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={clientStatusBadgeClassName(c.status)}>
                      {clientStatusLabel(c.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c._count.contacts}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c._count.emailSequences}
                  </TableCell>
                  <TableCell>
                    <Link prefetch={false}
                      href={`/clients/${c.id}`}
                      className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                    >
                      Open
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {clients.length === 0 ? (
            <div className="space-y-2 py-10 text-center text-sm text-muted-foreground">
              {emptyCopy?.variant === "no_clients_in_system" ? (
                <>
                  <p className="font-medium text-foreground">No clients yet</p>
                  <p>
                    Add your first client to start onboarding mailboxes, contacts,
                    and outreach.
                  </p>
                  <Link prefetch={false}
                    href="/clients/new"
                    className={cn(buttonVariants(), "mt-2 inline-flex")}
                  >
                    Add client
                  </Link>
                </>
              ) : (
                <>
                  <p className="font-medium text-foreground">Unable to load client workspaces</p>
                  <p className="text-balance">
                    Your account should see at least one workspace, but nothing was returned.
                    Please refresh the page or contact support if this keeps happening.
                  </p>
                </>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
