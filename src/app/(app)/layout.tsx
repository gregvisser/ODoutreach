import { AppHeader } from "@/components/app-shell/app-header";
import { AppSidebar } from "@/components/app-shell/app-sidebar";
import { StaffEmailBlocked } from "@/components/staff/staff-email-blocked";
import { StaffInactive } from "@/components/staff/staff-inactive";
import { StaffNotRegistered } from "@/components/staff/staff-not-registered";
import { gateStaffAccess } from "@/server/auth/staff";
import { getGlobalBrand } from "@/server/branding/get-global-brand";

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

  return (
    <div className="flex min-h-screen">
      <AppSidebar className="hidden md:flex" brand={brand} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader brand={brand} />
        <main className="flex-1 bg-gradient-to-b from-muted/30 to-background px-4 py-8 md:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
