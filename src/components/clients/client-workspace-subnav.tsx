"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

export function ClientWorkspaceSubnav({ clientId }: { clientId: string }) {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const clientFromQuery = searchParams?.get("client") ?? null;
  const base = `/clients/${clientId}`;

  const items: {
    label: string;
    href: string;
    isActive: () => boolean;
  }[] = [
    {
      label: "Overview",
      href: base,
      isActive: () => pathname === base,
    },
    {
      label: "Brief",
      href: `${base}/brief`,
      isActive: () => pathname === `${base}/brief` || pathname === `${base}/onboarding`,
    },
    {
      label: "Mailboxes",
      href: `${base}/mailboxes`,
      isActive: () => pathname === `${base}/mailboxes`,
    },
    // Sits next to Mailboxes because it is what you send the customer's IT
    // when a mailbox will not connect or its mail is going to spam. It is a
    // TAB, not a section of the Mailboxes page, because everything on that
    // page was conditional on already having a mailbox — so the client who
    // most needed these instructions was the one client who never saw them.
    {
      label: "Setup help",
      href: `${base}/setup-help`,
      isActive: () => pathname === `${base}/setup-help`,
    },
    // Suppression comes before import in the funnel: attach the client's
    // Do-not-contact sources first, then import contacts via Sources/Lists.
    {
      label: "Do-not-contact",
      href: `${base}/suppression`,
      isActive: () =>
        pathname === `${base}/suppression` ||
        ((pathname === "/suppression" || pathname.startsWith("/suppression/")) &&
          clientFromQuery === clientId),
    },
    {
      label: "Sources",
      href: `${base}/sources`,
      isActive: () => pathname === `${base}/sources`,
    },
    {
      label: "Lists",
      href: `${base}/contacts`,
      isActive: () =>
        pathname === `${base}/contacts` ||
        pathname.startsWith(`${base}/lists/`) ||
        (pathname === "/contacts" && clientFromQuery === clientId),
    },
    {
      label: "Templates",
      href: `${base}/templates`,
      isActive: () => pathname === `${base}/templates`,
    },
    {
      label: "Outreach",
      href: `${base}/outreach`,
      isActive: () => pathname === `${base}/outreach`,
    },
    {
      label: "Activity",
      href: `${base}/activity`,
      isActive: () =>
        pathname === `${base}/activity` ||
        ((pathname === "/activity" || pathname.startsWith("/activity/")) &&
          clientFromQuery === clientId),
    },
  ];

  return (
    <nav
      aria-label="Client workspace"
      className="-mx-1 flex flex-wrap gap-1 border-b border-border/80 pb-3"
    >
      {items.map((item) => {
        const active = item.isActive();
        return (
          <Link
            key={item.label}
            href={item.href}
            // See app-sidebar.tsx: these nine tabs are the other half of the
            // prefetch burst production sheds with 503. Prefetching them was
            // not making navigation faster, it was making the page load fail.
            prefetch={false}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
