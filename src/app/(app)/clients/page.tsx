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
import { requireStaffUser } from "@/server/auth/staff";
import { listClientsForStaff } from "@/server/queries/clients";
import { getAccessibleClientIds } from "@/server/tenant/access";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const staff = await requireStaffUser();
  const accessible = await getAccessibleClientIds(staff);
  const clients = await listClientsForStaff(accessible);

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Clients</h1>
          <p className="mt-1 text-muted-foreground">
            Workspaces you are allowed to access — data never mixes between tenants.
          </p>
        </div>
        <Link href="/clients/new" className={cn(buttonVariants())}>
          Onboard client
        </Link>
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Workspaces</CardTitle>
          <CardDescription>Status and quick counts from live data</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Contacts</TableHead>
                <TableHead className="text-right">Campaigns</TableHead>
                <TableHead className="w-[120px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{c.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c._count.contacts}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c._count.campaigns}
                  </TableCell>
                  <TableCell>
                    <Link
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
            <p className="py-8 text-center text-sm text-muted-foreground">
              No accessible clients — request membership or use an admin role.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
