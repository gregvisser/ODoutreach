import Link from "next/link";

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
import { isOrganisationAdminRole } from "@/lib/tenant/platform";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { loadStaffHomeOrganisation } from "@/server/tenant/organisation-scope";

import { InviteOrganisationStaffForm } from "./invite-form";

export const dynamic = "force-dynamic";

export default async function OrganisationSettingsPage() {
  const staff = await requireOpensDoorsStaff();
  const home = await loadStaffHomeOrganisation(staff.id);

  if (!home || !isOrganisationAdminRole(home.role)) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-2xl font-semibold">Organisation</h1>
        <p className="text-muted-foreground">
          Only an owner or admin of your organisation can invite staff.
        </p>
        <Link
          prefetch={false}
          href="/settings"
          className={cn(buttonVariants({ variant: "outline" }), "inline-flex")}
        >
          Back to settings
        </Link>
      </div>
    );
  }

  const members = await prisma.organisationMember.findMany({
    where: { organisationId: home.organisationId },
    orderBy: { staffUser: { email: "asc" } },
    include: {
      staffUser: {
        select: { email: true, isActive: true, role: true, guestInvitationState: true },
      },
    },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{home.name}</h1>
          <p className="mt-1 text-muted-foreground">
            People in your organisation. Invitations cannot add someone to a different organisation.
          </p>
        </div>
        <Link
          prefetch={false}
          href="/settings"
          className={cn(buttonVariants({ variant: "ghost" }), "text-sm shrink-0")}
        >
          ← Back to settings
        </Link>
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Invite someone</CardTitle>
          <CardDescription>
            They receive a Microsoft invitation and join {home.name} only. Their email domain must be allowed by STAFF_EMAIL_DOMAINS.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InviteOrganisationStaffForm />
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">People</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border rounded-md border border-border/70">
            {members.map((member) => (
              <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="font-medium">{member.staffUser.email}</span>
                <span className="text-muted-foreground">
                  {member.role === "OWNER" ? "Owner" : member.role === "ADMIN" ? "Admin" : "User"}
                  {member.staffUser.isActive ? "" : " · inactive"}
                  {member.staffUser.guestInvitationState === "PENDING" ? " · invitation pending" : ""}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
