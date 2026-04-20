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
    {
      label: "Sources",
      href: `${base}/sources`,
      isActive: () => pathname === `${base}/sources`,
    },
    {
      label: "Contacts",
      href: `${base}/contacts`,
      isActive: () =>
        pathname === `${base}/contacts` ||
        (pathname === "/contacts" && clientFromQuery === clientId),
    },
    {
      label: "Suppression",
      href: `${base}/suppression`,
      isActive: () =>
        pathname === `${base}/suppression` ||
        ((pathname === "/suppression" || pathname.startsWith("/suppression/")) &&
          clientFromQuery === clientId),
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
