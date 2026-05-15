import type { LucideIcon } from "lucide-react";
import {
  Globe2,
  GraduationCap,
  ListFilter,
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
 * outbound flow.
 *
 * PR #138 (G10 in SYSTEM_HANDOVER_GAPS.md): the global Contacts route
 * (`/contacts`) is removed from the sidebar because Universe is now the
 * canonical cross-client contact warehouse and per-client Sources owns
 * imports. The `/contacts` route itself is preserved (it still owns the
 * cross-client CSV import + per-row send sheet) but is no longer advertised
 * here — staff reach contact directory via Universe, and per-client imports
 * via Sources.
 *
 * PR #140 (G11): the global Activity route (`/activity`) is removed from
 * the sidebar because per-client Activity is the trusted operational view
 * (it groups replies by mailbox, links into reply detail, and stops random
 * inbox mail from leaking in). The `/activity` route itself is preserved
 * as an admin-only legacy debug surface — non-admin staff are redirected
 * to `/clients` to pick a workspace.
 *
 * See `docs/ops/SYSTEM_HANDOVER_READINESS_AUDIT.md`.
 */
export const mainNav: NavItem[] = [
  { title: "Reports", href: "/reporting", icon: PieChart },
  { title: "Clients", href: "/clients", icon: Users },
  { title: "New client", href: "/clients/new", icon: Sparkles },
  { title: "Universe", href: "/universe", icon: Globe2 },
  { title: "Do-not-contact", href: "/suppression", icon: ListFilter },
  { title: "Training", href: "/training", icon: GraduationCap },
  { title: "Settings", href: "/settings", icon: Settings },
];
