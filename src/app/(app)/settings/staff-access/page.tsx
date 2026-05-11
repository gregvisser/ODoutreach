import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/utils";
import { requireOpensDoorsStaff } from "@/server/auth/staff";

import { StaffAccessPanel, type StaffRow } from "./staff-access-panel";
import { StaffAccessRecentActivity } from "./staff-access-recent-activity";

export const dynamic = "force-dynamic";

export default async function StaffAccessPage() {
  const staff = await requireOpensDoorsStaff();

  if (staff.role !== "ADMIN") {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-2xl font-semibold">Staff access</h1>
        <p className="text-muted-foreground">
          Only administrators can add staff or change roles. Contact an
          administrator if you need access adjusted.
        </p>
        <Link
          href="/settings"
          className={cn(buttonVariants({ variant: "outline" }), "inline-flex")}
        >
          Back to settings
        </Link>
      </div>
    );
  }

  const rows = await prisma.staffUser.findMany({
    orderBy: { email: "asc" },
    include: {
      invitedBy: { select: { email: true } },
    },
  });

  const initialRows: StaffRow[] = rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role,
    isActive: r.isActive,
    guestInvitationState: r.guestInvitationState,
    invitedAt: r.invitedAt?.toISOString() ?? null,
    invitationLastSentAt: r.invitationLastSentAt?.toISOString() ?? null,
    invitedByEmail: r.invitedBy?.email ?? null,
    graphInvitedUserObjectId: r.graphInvitedUserObjectId,
    updatedAt: r.updatedAt.toISOString(),
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Staff access</h1>
          <p className="mt-1 text-muted-foreground">
            Add people to the app, assign roles, and turn access on or off. Staff
            who already have a <code className="text-xs">StaffUser</code> row
            sign in directly with Microsoft 365 (MFA is enforced by your
            organisation). Optional B2B guest invitation is only needed when you
            want Microsoft to add someone to a tenant as a guest first.
          </p>
        </div>
        <Link
          href="/settings"
          className={cn(buttonVariants({ variant: "ghost" }), "text-sm shrink-0")}
        >
          ← Back to settings
        </Link>
      </div>

      <StaffAccessPanel initialRows={initialRows} />

      <StaffAccessRecentActivity />
    </div>
  );
}
