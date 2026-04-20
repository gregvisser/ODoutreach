"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

function useHash(): string {
  const [hash, setHash] = useState("");
  useEffect(() => {
    const sync = () => setHash(typeof window !== "undefined" ? window.location.hash : "");
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  return hash;
}

export function ClientWorkspaceSubnav({ clientId }: { clientId: string }) {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const clientFromQuery = searchParams?.get("client") ?? null;
  const hash = useHash();
  const base = `/clients/${clientId}`;

  const items: {
    label: string;
    href: string;
    isActive: () => boolean;
  }[] = [
    {
      label: "Overview",
      href: base,
      isActive: () => pathname === base && (hash === "" || hash === "#"),
    },
    {
      label: "Onboarding",
      href: `${base}/onboarding`,
      isActive: () => pathname === `${base}/onboarding`,
    },
    {
      label: "Mailboxes",
      href: `${base}#mailboxes`,
      isActive: () => pathname === base && hash === "#mailboxes",
    },
    {
      label: "Contacts",
      href: `/contacts?client=${clientId}`,
      isActive: () =>
        (pathname === "/contacts" || pathname.startsWith("/contacts/")) &&
        clientFromQuery === clientId,
    },
    {
      label: "Suppression",
      href: `/suppression?client=${clientId}`,
      isActive: () =>
        (pathname === "/suppression" || pathname.startsWith("/suppression/")) &&
        clientFromQuery === clientId,
    },
    {
      label: "Outreach",
      href: `${base}#outreach`,
      isActive: () => pathname === base && hash === "#outreach",
    },
    {
      label: "Activity",
      href: `/activity?client=${clientId}`,
      isActive: () =>
        (pathname === "/activity" || pathname.startsWith("/activity/")) &&
        clientFromQuery === clientId,
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
