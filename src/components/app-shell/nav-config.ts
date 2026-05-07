import { isOpensDoorsSuperadminStaff } from "@/lib/staff/opensdoors-superadmin";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  GraduationCap,
  LayoutDashboard,
  ListFilter,
  Mail,
  PieChart,
  Settings,
  Sparkles,
  Users,
  Wrench,
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
};

/** Cross-client console — distinct from per-client workspace modules in the client subnav. */
export const mainNav: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Clients", href: "/clients", icon: Users },
  { title: "New client", href: "/clients/new", icon: Sparkles },
  { title: "Admin operations", href: "/operations/outbound", icon: Wrench },
  { title: "Contacts", href: "/contacts", icon: Mail },
  { title: "Do-not-contact", href: "/suppression", icon: ListFilter },
  { title: "Activity", href: "/activity", icon: Activity },
  { title: "Reports", href: "/reporting", icon: PieChart },
  { title: "Training", href: "/training", icon: GraduationCap },
  { title: "Settings", href: "/settings", icon: Settings },
];

/** Hides queue/provider admin nav for day-to-day operators. */
export function getMainNavForStaff(staff: { email: string }): NavItem[] {
  if (isOpensDoorsSuperadminStaff(staff)) {
    return mainNav;
  }
  return mainNav.filter((item) => item.href !== "/operations/outbound");
}
