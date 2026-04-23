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
          Only administrators can invite colleagues or change roles. Contact an
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
            Invite colleagues, assign roles, and deactivate access. Invitations
            and sign-in are handled by Microsoft 365 — this page manages who is
            allowed into OpensDoors Outreach and what they can do.
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
