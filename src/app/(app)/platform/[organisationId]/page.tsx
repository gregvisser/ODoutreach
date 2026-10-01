import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/utils";
import { hasPlatformAdminAccess, resolveOrganisationFeatureFlags } from "@/lib/tenant/organisation";
import { requireOpensDoorsStaff } from "@/server/auth/staff";

import {
  InviteOrganisationOwnerForm,
  OrganisationFlagsForm,
  OrganisationStatusForm,
} from "../platform-forms";

export const dynamic = "force-dynamic";

export default async function PlatformOrganisationPage({
  params,
}: {
  params: Promise<{ organisationId: string }>;
}) {
  const staff = await requireOpensDoorsStaff();
  if (!hasPlatformAdminAccess(staff)) notFound();

  const { organisationId } = await params;
  const organisation = await prisma.organisation.findUnique({
    where: { id: organisationId },
    include: {
      members: {
        orderBy: { createdAt: "asc" },
        include: {
          staffUser: {
            select: { email: true, isActive: true, role: true, isPlatformAdmin: true, isSuperAdmin: true },
          },
        },
      },
      _count: { select: { clients: true } },
    },
  });
  if (!organisation) notFound();

  const flags = resolveOrganisationFeatureFlags(organisation.featureFlags);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{organisation.name}</h1>
          <p className="mt-1 text-muted-foreground">
            {organisation.slug} · {organisation.status === "ACTIVE" ? "Active" : "Suspended"} ·{" "}
            {organisation._count.clients} {organisation._count.clients === 1 ? "client" : "clients"}
          </p>
        </div>
        <Link
          prefetch={false}
          href="/platform"
          className={cn(buttonVariants({ variant: "ghost" }), "text-sm shrink-0")}
        >
          ← All organisations
        </Link>
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Status</CardTitle>
          <CardDescription>
            Suspending an organisation stops its staff from opening the app. A platform administrator can still sign in and turn it back on. OpensDoors can be suspended the same way.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OrganisationStatusForm organisationId={organisation.id} status={organisation.status} />
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Capabilities</CardTitle>
          <CardDescription>
            Each switch is stored on this organisation. A platform-wide emergency brake can still turn a capability off for everyone. Machine sending stays a per-client choice underneath the organisation ceiling.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OrganisationFlagsForm organisationId={organisation.id} flags={flags} />
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Invite an owner</CardTitle>
          <CardDescription>
            The invitation joins this organisation only. It does not grant platform access or the ability to delete workspaces. Their email domain must be listed in STAFF_EMAIL_DOMAINS or they will not be able to sign in.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <InviteOrganisationOwnerForm organisationId={organisation.id} />
          {organisation.members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No one is in this organisation yet.</p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border/70">
              {organisation.members.map((member) => (
                <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="font-medium">{member.staffUser.email}</span>
                  <span className="text-muted-foreground">
                    {member.role === "OWNER" ? "Owner" : member.role === "ADMIN" ? "Admin" : "User"}
                    {member.staffUser.isActive ? "" : " · inactive"}
                    {member.staffUser.isPlatformAdmin || member.staffUser.isSuperAdmin
                      ? " · elevated account"
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
