import { AppHeader } from "@/components/app-shell/app-header";
import { AppSidebar } from "@/components/app-shell/app-sidebar";
import { LegalFooterLinks } from "@/components/legal/legal-footer-links";
import { NewReplyNotifier } from "@/components/notifications/new-reply-notifier";
import { StaffEmailBlocked } from "@/components/staff/staff-email-blocked";
import { StaffInactive } from "@/components/staff/staff-inactive";
import { StaffNotRegistered } from "@/components/staff/staff-not-registered";
import { StaffOrganisationSuspended } from "@/components/staff/staff-organisation-suspended";
import { hasPlatformAdminAccess } from "@/lib/tenant/organisation";
import { staffBlockedBySuspendedOrganisation } from "@/lib/tenant/platform";
import { gateStaffAccess } from "@/server/auth/staff";
import { getGlobalBrand } from "@/server/branding/get-global-brand";
import { getGoogleReconnectNeedsAttentionCount } from "@/server/queries/google-reconnects";
import { listOrganisationsStaffMayEnter } from "@/server/tenant/acting-organisation";
import { loadStaffHomeOrganisation } from "@/server/tenant/organisation-scope";

export default async function AppLayout({
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

  const home = await loadStaffHomeOrganisation(gate.staff.id);
  const enterable = await listOrganisationsStaffMayEnter(gate.staff);
  if (
    staffBlockedBySuspendedOrganisation({
      isPlatformAdmin: gate.staff.isPlatformAdmin,
      email: gate.staff.email,
      organisationStatus: home?.status ?? null,
    })
  ) {
    return (
      <StaffOrganisationSuspended
        organisationName={home?.name ?? "This organisation"}
        alternatives={enterable.filter(
          (organisation) => organisation.status === "ACTIVE" && organisation.id !== home?.organisationId,
        )}
      />
    );
  }

  const showPlatformNav = hasPlatformAdminAccess(gate.staff);
  const effective = await getGlobalBrand();
  const brand = {
    logoUrl: effective.logoUrl,
    markUrl: effective.markUrl,
    brandName: effective.brandName,
    productName: effective.productName,
    logoAltText: effective.logoAltText,
  };
  // Row 155: an ambient count on every page, not just the once-a-day digest
  // Greg alone receives. Never throws the layout down if the count fails —
  // a missing badge is a cosmetic loss, not a reason to break every page.
  const googleReconnectsAttentionCount = await getGoogleReconnectNeedsAttentionCount().catch(
    () => 0,
  );

  return (
    <div className="flex min-h-screen">
      <AppSidebar
        className="hidden md:sticky md:top-0 md:flex md:h-screen md:max-h-screen md:shrink-0 md:self-start md:overflow-y-auto"
        brand={brand}
        isSuperAdmin={gate.staff.isSuperAdmin}
        showPlatformNav={showPlatformNav}
        googleReconnectsAttentionCount={googleReconnectsAttentionCount}
        organisations={enterable}
        actingOrganisationId={home?.organisationId ?? null}
        actingOrganisationName={home?.name ?? null}
      />
      <div className="flex h-dvh min-w-0 flex-1 flex-col overflow-x-clip overflow-y-auto">
        <AppHeader
          brand={brand}
          isSuperAdmin={gate.staff.isSuperAdmin}
          showPlatformNav={showPlatformNav}
          googleReconnectsAttentionCount={googleReconnectsAttentionCount}
          organisations={enterable}
          actingOrganisationId={home?.organisationId ?? null}
          actingOrganisationName={home?.name ?? null}
        />
        <main className="min-w-0 flex-1 bg-background px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
        <footer className="border-t border-border bg-background px-4 py-6 md:px-8">
          <LegalFooterLinks />
        </footer>
      </div>
      <NewReplyNotifier />
    </div>
  );
}
