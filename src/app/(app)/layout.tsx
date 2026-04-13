import { AppHeader } from "@/components/app-shell/app-header";
import { AppSidebar } from "@/components/app-shell/app-sidebar";
import { StaffEmailBlocked } from "@/components/staff/staff-email-blocked";
import { isStaffEmailAllowed, requireStaffUser } from "@/server/auth/staff";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await requireStaffUser();
  if (!isStaffEmailAllowed(staff)) {
    return <StaffEmailBlocked email={staff.email} />;
  }

  return (
    <div className="flex min-h-screen">
      <AppSidebar className="hidden md:flex" />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader />
        <main className="flex-1 bg-gradient-to-b from-muted/30 to-background px-4 py-8 md:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
