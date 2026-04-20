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

/** Cross-client console — distinct from per-client workspace modules in the client subnav. */
export const mainNav: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Clients", href: "/clients", icon: Users },
  { title: "New client", href: "/clients/new", icon: Sparkles },
  { title: "Operations", href: "/operations/outbound", icon: Wrench },
  { title: "Contacts", href: "/contacts", icon: Mail },
  { title: "Suppression", href: "/suppression", icon: ListFilter },
  { title: "Activity", href: "/activity", icon: Activity },
  { title: "Reports", href: "/reporting", icon: PieChart },
  { title: "Settings", href: "/settings", icon: Settings },
];
