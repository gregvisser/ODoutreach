"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

function Table({
  className,
  scroll = "page",
  ...props
}: React.ComponentProps<"table"> & {
  /**
   * `page` — the page scrolls and the header sticks under the app header
   * when the table fits the column.
   * `contained` — a short capped region beside other content.
   * `viewport` — a wide list. The region scrolls both ways, its height tracks
   * the viewport, and the header sticks inside that region. Pagination stays
   * outside the table.
   */
  scroll?: "contained" | "page" | "viewport"
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [widerThanContainer, setWiderThanContainer] = React.useState(false);

  React.useEffect(() => {
    if (scroll !== "page") return undefined;
    const container = containerRef.current;
    const table = container?.querySelector("table");
    if (!container || !table) return undefined;
    const measure = () => {
      setWiderThanContainer(table.scrollWidth > container.clientWidth + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(table);
    return () => observer.disconnect();
  }, [scroll]);

  return (
    <div
      ref={containerRef}
      data-slot="table-container"
      data-scroll={scroll}
      data-wide={widerThanContainer ? "true" : "false"}
      className={cn(
        "group/table relative w-full",
        scroll === "viewport"
          ? "max-h-[max(16rem,calc(100dvh-11rem))] overflow-auto"
          : scroll === "contained"
            ? "max-h-[min(70vh,40rem)] overflow-auto"
            : widerThanContainer
              ? "overflow-x-auto overflow-y-clip"
              : "overflow-x-clip overflow-y-clip",
      )}
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn(
        "z-10 bg-card [&_tr]:border-b",
        "group-data-[scroll=contained]/table:sticky group-data-[scroll=contained]/table:top-0",
        "group-data-[scroll=viewport]/table:sticky group-data-[scroll=viewport]/table:top-0",
        // A sideways-scrolling wrapper is its own scrollport. A 4rem offset
        // inside that box pulls the header down over the first rows, so page
        // mode only sticks when the table fits and the page itself scrolls.
        "group-data-[scroll=page]/table:group-data-[wide=false]/table:sticky group-data-[scroll=page]/table:group-data-[wide=false]/table:top-[var(--table-sticky-top,4rem)]",
        className,
      )}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn(
        "[&_tr:last-child]:border-0",
        // Keep a scrolled row below the sticky header, including for clicks.
        "[&_tr]:scroll-mt-[calc(var(--table-sticky-top,4rem)+2.75rem)]",
        className,
      )}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-3 text-left align-middle text-xs font-medium tracking-wide whitespace-nowrap text-muted-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "px-3 py-2.5 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
