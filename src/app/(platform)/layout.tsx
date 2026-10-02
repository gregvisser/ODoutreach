import { LegalFooterLinks } from "@/components/legal/legal-footer-links";
import { PlatformShell } from "@/components/platform/platform-shell";
import { StaffEmailBlocked } from "@/components/staff/staff-email-blocked";
import { StaffInactive } from "@/components/staff/staff-inactive";
import { StaffNotRegistered } from "@/components/staff/staff-not-registered";
import { gateStaffAccess } from "@/server/auth/staff";
import { assertPlatformDashboardAccess } from "@/server/tenant/platform-admin";

export const dynamic = "force-dynamic";

/**
 * Platform dashboard shell. Separate from the organisation workspace:
 * no tenant sidebar, no organisation switcher. Anyone who is not a
 * Bidlow platform administrator gets a not-found response here.
 */
export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const gate = await gateStaffAccess();
  if (gate.status === "not_registered") {
    return <StaffNotRegistered email={gate.sessionEmail} />;
  }
  if (gate.status === "inactive") {
    return <StaffInactive email={gate.email} />;
  }
  if (gate.status === "domain_blocked") {
    return <StaffEmailBlocked email={gate.staff.email} />;
  }

  assertPlatformDashboardAccess(gate.staff);

  return (
    <div className="flex min-h-screen flex-col">
      <PlatformShell email={gate.staff.email}>
        <div className="flex min-h-full flex-1 flex-col">
          <div className="flex-1">{children}</div>
          <footer className="mt-10 border-t border-border py-6">
            <LegalFooterLinks />
          </footer>
        </div>
      </PlatformShell>
    </div>
  );
}
