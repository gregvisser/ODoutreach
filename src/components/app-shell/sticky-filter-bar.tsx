import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Page title plus filters.
 * On tablet and desktop the bar stays under the app header while the page scrolls.
 * On a phone it scrolls away so it does not cover the content.
 */
export function StickyFilterBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 bg-background",
        "md:sticky md:top-16 md:z-30 md:-mx-8 md:border-b md:border-border md:px-8 md:py-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
