"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

export function ClientWorkspaceSubnav({ clientId }: { clientId: string }) {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const activeTabRef = useRef<HTMLAnchorElement>(null);
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
      label: "Email approvals",
      href: `${base}/email-review`,
      isActive: () => pathname === `${base}/email-review`,
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

  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [pathname]);

  return (
    <nav
      aria-label="Client workspace"
      className="sticky top-16 z-30 border-b border-border/80 bg-background"
    >
      <div className="relative">
      <div className="flex gap-1 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((item) => {
        const active = item.isActive();
        return (
          <Link
            key={item.label}
            ref={active ? activeTabRef : undefined}
            href={item.href}
            // See app-sidebar.tsx: these nine tabs are the other half of the
            // prefetch burst production sheds with 503. Prefetching them was
            // not making navigation faster, it was making the page load fail.
            prefetch={false}
            className={cn(
              "inline-flex shrink-0 items-center rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors max-md:min-h-11",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-background to-transparent md:hidden" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background to-transparent md:hidden" />
      </div>
    </nav>
  );
}
