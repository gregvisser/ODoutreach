"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { buildMainNav } from "./nav-config";

type BrandProp = {
  markUrl: string;
  brandName: string;
  productName: string;
  logoAltText: string;
};

export function AppSidebar({
  className,
  brand,
  googleReconnectsAttentionCount = 0,
  isSuperAdmin = false,
}: {
  className?: string;
  brand: BrandProp;
  /** Row 155: badges "Google logins" whenever a mailbox needs reconnecting. */
  googleReconnectsAttentionCount?: number;
  isSuperAdmin?: boolean;
}) {
  const pathname = usePathname();
  const items = buildMainNav(googleReconnectsAttentionCount).filter(
    (item) => item.href !== "/clients/new" || isSuperAdmin,
  );

  return (
    <aside
      className={cn(
        "flex w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
        className,
      )}
    >
      <Link
        href="/reporting"
        prefetch={false}
        className="flex h-20 items-center gap-3 border-b border-sidebar-border px-6 transition-opacity hover:opacity-90"
        aria-label={`${brand.brandName} ${brand.productName} home`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- URL can be external (admin-supplied) or local SVG; optimizer is unnecessary. */}
        <img
          src={brand.markUrl}
          alt=""
          aria-hidden="true"
          className="h-10 w-10 shrink-0 rounded-lg"
          width={40}
          height={40}
          decoding="async"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight">
            {brand.brandName}
          </p>
          <p className="text-xs text-muted-foreground">{brand.productName}</p>
        </div>
      </Link>
      {/*
        `prefetch={false}` on every link here is deliberate and load-bearing.

        Next.js prefetches each Link as it enters the viewport, so the whole
        sidebar plus the client subnav fired ~18 server-rendered `?_rsc=`
        requests the moment a client screen opened. Measured against production
        on 2026-08-26, App Service answered most of them 503 — it sheds under
        that burst — so the prefetch cache stayed EMPTY and every tab click was
        a cold render anyway. Worse, the burst also shed a real server-action
        POST from the do-not-contact panel.

        We give up nothing that was working: the prefetches were failing. Revisit
        if the App Service plan is scaled up (it is B1, single instance).
      */}
      <nav className="flex-1 space-y-0.5 p-3">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0 opacity-80" />
              {item.title}
              {item.badge !== undefined && (
                <span
                  className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-semibold text-destructive-foreground"
                  aria-label={`${item.badge} need attention`}
                >
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-sidebar-border p-4 text-xs text-muted-foreground">
        Internal workspace — staff access only
      </div>
    </aside>
  );
}
