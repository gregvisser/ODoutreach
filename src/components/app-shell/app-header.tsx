"use client";

import { signOut, useSession } from "next-auth/react";
import { Menu } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import { AppSidebar } from "./app-sidebar";

export function AppHeader() {
  const { data: session } = useSession();

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-4 border-b border-border/60 bg-background/80 px-4 backdrop-blur-md md:px-8">
      <div className="flex items-center gap-3">
        <Sheet>
          <SheetTrigger
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon" }),
              "md:hidden",
            )}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation</SheetTitle>
            </SheetHeader>
            <AppSidebar className="border-0" />
          </SheetContent>
        </Sheet>
        <p className="hidden text-sm text-muted-foreground sm:block">
          Internal outreach console
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden max-w-[200px] truncate text-sm text-muted-foreground sm:inline">
          {session?.user?.email ?? session?.user?.name ?? ""}
        </span>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/sign-in" })}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "shrink-0",
          )}
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
