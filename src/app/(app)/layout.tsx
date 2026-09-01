import { AppHeader } from "@/components/app-shell/app-header";
import { AppSidebar } from "@/components/app-shell/app-sidebar";
import { LegalFooterLinks } from "@/components/legal/legal-footer-links";
import { NewReplyNotifier } from "@/components/notifications/new-reply-notifier";
import { StaffEmailBlocked } from "@/components/staff/staff-email-blocked";
import { StaffInactive } from "@/components/staff/staff-inactive";
import { StaffNotRegistered } from "@/components/staff/staff-not-registered";
import { gateStaffAccess } from "@/server/auth/staff";
import { getGlobalBrand } from "@/server/branding/get-global-brand";
import { getGoogleReconnectNeedsAttentionCount } from "@/server/queries/google-reconnects";

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
        className="hidden md:flex"
        brand={brand}
        googleReconnectsAttentionCount={googleReconnectsAttentionCount}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader brand={brand} googleReconnectsAttentionCount={googleReconnectsAttentionCount} />
        <main className="flex-1 bg-gradient-to-b from-muted/30 to-background px-4 py-8 md:px-8">
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
