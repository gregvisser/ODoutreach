"use client";

import { signOut } from "next-auth/react";
import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { SwitchAccountButton } from "@/components/auth/switch-account-button";
import { buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { PLATFORM_DASHBOARD_PATH } from "@/lib/tenant/platform";
import { cn } from "@/lib/utils";

const PLATFORM_NAV = [{ title: "Organisations", href: PLATFORM_DASHBOARD_PATH }] as const;

function navActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function PlatformNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1" aria-label="Platform">
      {PLATFORM_NAV.map((item) => {
        const active = navActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium max-md:min-h-11",
              active
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
            )}
          >
            {item.title}
          </Link>
        );
      })}
    </nav>
  );
}

export function PlatformShell({
  email,
  children,
}: {
  email: string;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="border-b border-border px-5 py-5">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Bidlow
          </p>
          <p className="mt-1 text-lg font-semibold tracking-tight">Platform</p>
        </div>
        <div className="p-3">
          <PlatformNav />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b border-border bg-background px-4 md:px-8">
          <div className="flex items-center gap-3">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger
                className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "md:hidden")}
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </SheetTrigger>
              <SheetContent side="left" className="w-72 bg-card p-0">
                <SheetHeader className="border-b border-border px-5 py-5 text-left">
                  <SheetTitle className="text-lg">Platform</SheetTitle>
                </SheetHeader>
                <div className="p-3">
                  <PlatformNav onNavigate={() => setMenuOpen(false)} />
                </div>
              </SheetContent>
            </Sheet>
            <p className="text-sm font-semibold tracking-tight md:hidden">Platform</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden max-w-[220px] truncate text-sm text-muted-foreground sm:inline">
              {email}
            </span>
            <SwitchAccountButton className="hidden md:block" />
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/sign-in" })}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")}
            >
              Sign out
            </button>
          </div>
        </header>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
