import type { LucideIcon } from "lucide-react";
import {
  Activity,
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

export const mainNav: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Clients", href: "/clients", icon: Users },
  { title: "Onboarding", href: "/clients/new", icon: Sparkles },
  { title: "Suppression", href: "/suppression", icon: ListFilter },
  { title: "Contacts", href: "/contacts", icon: Mail },
  { title: "Outreach activity", href: "/activity", icon: Activity },
  { title: "Outbound ops", href: "/operations/outbound", icon: Wrench },
  { title: "Reporting", href: "/reporting", icon: PieChart },
  { title: "Settings", href: "/settings", icon: Settings },
];
