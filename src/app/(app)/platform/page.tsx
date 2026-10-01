import Link from "next/link";
import { notFound } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { prisma } from "@/lib/db";
import { hasPlatformAdminAccess } from "@/lib/tenant/organisation";
import { requireOpensDoorsStaff } from "@/server/auth/staff";

import { CreateOrganisationForm } from "./platform-forms";

export const dynamic = "force-dynamic";

export default async function PlatformPage() {
  const staff = await requireOpensDoorsStaff();
  if (!hasPlatformAdminAccess(staff)) notFound();

  const organisations = await prisma.organisation.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { members: true, clients: true } } },
  });

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Platform</h1>
        <p className="mt-1 text-muted-foreground">
          Organisations on this platform. OpensDoors is one of them. Each organisation only sees its own clients, people, and sending.
        </p>
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">New organisation</CardTitle>
          <CardDescription>
            Creates an active organisation with every capability switched on, matching OpensDoors today. You invite the first owner from its page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateOrganisationForm />
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Organisations</h2>
        <ul className="grid gap-3">
          {organisations.map((organisation) => (
            <li key={organisation.id}>
              <Card className="border-border/80 shadow-sm">
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div>
                    <p className="font-medium">{organisation.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {organisation.slug} · {organisation.status === "ACTIVE" ? "Active" : "Suspended"} ·{" "}
                      {organisation._count.members} {organisation._count.members === 1 ? "person" : "people"} ·{" "}
                      {organisation._count.clients} {organisation._count.clients === 1 ? "client" : "clients"}
                    </p>
                  </div>
                  <Link
                    prefetch={false}
                    href={`/platform/${organisation.id}`}
                    className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Open →
                  </Link>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
