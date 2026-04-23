"use client";

import { signOut, useSession } from "next-auth/react";
import { Menu } from "lucide-react";

import { AppBrandLogo } from "@/components/brand/app-brand-logo";
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

type BrandProp = {
  logoUrl: string;
  markUrl: string;
  brandName: string;
  productName: string;
  logoAltText: string;
};

export function AppHeader({ brand }: { brand: BrandProp }) {
  const { data: session } = useSession();

  return (
    <header className="sticky top-0 z-40 grid h-20 grid-cols-[auto_1fr_auto] items-center gap-4 border-b border-border/60 bg-background/80 px-4 backdrop-blur-md md:px-8">
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
            <AppSidebar className="border-0" brand={brand} />
          </SheetContent>
        </Sheet>
      </div>
      <div className="flex min-w-0 justify-center">
        <AppBrandLogo
          src={brand.logoUrl}
          alt={brand.logoAltText}
          brandName={brand.brandName}
          productName={brand.productName}
          heightClassName="h-9 md:h-12"
        />
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
