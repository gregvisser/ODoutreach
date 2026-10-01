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
  OrganisationHostnameForm,
  OrganisationLimitsForm,
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
  const aiSpend = await prisma.aiUsageEvent.aggregate({
    where: { organisationId: organisation.id, status: "OK" },
    _sum: { costMicroUsd: true },
  });
  const aiSpentMicroUsd = aiSpend._sum.costMicroUsd ?? 0;

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
          <CardTitle className="text-lg">Hostname</CardTitle>
          <CardDescription>
            The public address for this organisation. opensdoors.bidlow.co.uk always stays OpensDoors, including when this field is empty or cleared. Leave it blank until the address already reaches this app: the App Service custom domain, DNS, the certificate, the Entra sign-in redirect, and the mailbox OAuth redirects are set outside this screen. A logo that has not been uploaded still uses the shipped artwork. The name in the shell uses this organisation&apos;s name until a brand name is saved.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OrganisationHostnameForm
            organisationId={organisation.id}
            hostname={organisation.hostname}
          />
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Capabilities</CardTitle>
          <CardDescription>
            Each switch is this organisation&apos;s ceiling. An environment emergency brake still turns a capability off for everyone. Machine sending stays a per-client choice underneath the organisation ceiling.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OrganisationFlagsForm organisationId={organisation.id} flags={flags} />
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Usage and limits</CardTitle>
          <CardDescription>
            RocketReach lookups used: {organisation.rocketReachCreditsUsed}
            {organisation.rocketReachCreditAllowance === null
              ? " (no organisation cap)."
              : ` of ${organisation.rocketReachCreditAllowance}.`}{" "}
            AI spend: {aiSpentMicroUsd} micro-USD
            {organisation.aiSpendCapMicroUsd === null
              ? " (no cap)."
              : ` of ${organisation.aiSpendCapMicroUsd}.`}{" "}
            Empty fields mean no extra cap. The platform reserve is ROCKETREACH_PLATFORM_RESERVE_CREDITS.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OrganisationLimitsForm
            organisationId={organisation.id}
            rocketReachCreditAllowance={organisation.rocketReachCreditAllowance}
            aiSpendCapMicroUsd={organisation.aiSpendCapMicroUsd}
          />
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
