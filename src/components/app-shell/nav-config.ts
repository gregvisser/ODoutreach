import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Globe2,
  GraduationCap,
  ListFilter,
  Mail,
  PieChart,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
};

/**
 * Cross-client console — distinct from per-client workspace modules in the
 * client subnav.
 *
 * Reports is the primary staff destination (operational dashboard). The legacy
 * `/dashboard` route is preserved as a redirect to `/reporting` for any old
 * bookmarks but is intentionally not listed here. Admin operations
 * (`/operations/outbound`) is also intentionally not listed here — it is a
 * delivery/queue diagnostic surface for admins only; the route is still
 * reachable from internal links and from action-redirect targets in the
 * outbound flow. Both decisions are tracked in
 * `docs/ops/SYSTEM_HANDOVER_READINESS_AUDIT.md`.
 */
export const mainNav: NavItem[] = [
  { title: "Reports", href: "/reporting", icon: PieChart },
  { title: "Clients", href: "/clients", icon: Users },
  { title: "New client", href: "/clients/new", icon: Sparkles },
  { title: "Contacts", href: "/contacts", icon: Mail },
  { title: "Universe", href: "/universe", icon: Globe2 },
  { title: "Do-not-contact", href: "/suppression", icon: ListFilter },
  { title: "Activity", href: "/activity", icon: Activity },
  { title: "Training", href: "/training", icon: GraduationCap },
  { title: "Settings", href: "/settings", icon: Settings },
];
