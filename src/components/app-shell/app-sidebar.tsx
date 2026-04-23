"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { BRAND } from "@/components/brand/brand-config";
import { cn } from "@/lib/utils";

import { mainNav } from "./nav-config";

export function AppSidebar({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "flex w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
        className,
      )}
    >
      <Link
        href="/dashboard"
        className="flex h-16 items-center gap-2 border-b border-sidebar-border px-6 transition-opacity hover:opacity-90"
        aria-label={`${BRAND.name} ${BRAND.product} home`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Local SVG served from /public. */}
        <img
          src={BRAND.markSrc}
          alt=""
          aria-hidden="true"
          className="h-9 w-9 shrink-0 rounded-lg"
          width={36}
          height={36}
          decoding="async"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight">
            {BRAND.name}
          </p>
          <p className="text-xs text-muted-foreground">{BRAND.product}</p>
        </div>
      </Link>
      <nav className="flex-1 space-y-0.5 p-3">
        {mainNav.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0 opacity-80" />
              {item.title}
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
