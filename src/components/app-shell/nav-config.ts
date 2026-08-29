import type { LucideIcon } from "lucide-react";
import {
  Globe2,
  GraduationCap,
  KeyRound,
  LifeBuoy,
  ListFilter,
  MailQuestion,
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
  // Every reply still waiting on a human, across all clients. Listed second,
  // directly under Reports: a warm reply going cold is the most expensive
  // thing that happens in this product, and the per-client Activity tab could
  // only show it to somebody who had already guessed which workspace to open.
  // Same reasoning as "Google logins" below — a queue nobody can find is a
  // queue nobody works.
  { title: "Replies to answer", href: "/replies", icon: MailQuestion },
  { title: "Clients", href: "/clients", icon: Users },
  { title: "New client", href: "/clients/new", icon: Sparkles },
  { title: "Universe", href: "/universe", icon: Globe2 },
  // Cross-client blocked list. Named "Blocked contacts" (not "Do-not-contact")
  // so it doesn't collide with the per-client "Do-not-contact" workspace tab,
  // and echoes the page's own H1 "People blocked from outreach". The app avoids
  // the word "suppression" in user copy. Route /suppression is unchanged.
  { title: "Blocked contacts", href: "/suppression", icon: ListFilter },
  // The weekly Google reconnect chore, on one screen. Listed here deliberately,
  // unlike /operations: Google logins expire seven days after sign-in while the
  // OAuth app stays unpublished, reconnecting is self-service for all staff, and
  // a chore nobody can find is a chore that does not get done.
  { title: "Google logins", href: "/google-reconnects", icon: KeyRound },
  { title: "Training", href: "/training", icon: GraduationCap },
  { title: "Support", href: "/support", icon: LifeBuoy },
  { title: "Settings", href: "/settings", icon: Settings },
];
