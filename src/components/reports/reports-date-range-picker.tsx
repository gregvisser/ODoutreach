"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/**
 * Date-range filter for /reporting. Native date inputs (built-in calendar
 * popup, no extra dependency), preserving the selected client chip via
 * the `client` query param. "All time" clears the range.
 */
export function ReportsDateRangePicker({
  clientId,
  fromIso,
  toIso,
}: {
  clientId: string | null;
  /** Currently applied range (null = all-time). */
  fromIso: string | null;
  toIso: string | null;
}) {
  const router = useRouter();
  const [from, setFrom] = useState(fromIso ?? "");
  const [to, setTo] = useState(toIso ?? "");
  const [pending, startTransition] = useTransition();

  function buildHref(range: { from: string; to: string } | null): string {
    const params = new URLSearchParams();
    if (clientId) params.set("client", clientId);
    if (range) {
      params.set("from", range.from);
      params.set("to", range.to);
    }
    const qs = params.toString();
    return qs ? `/reporting?${qs}` : "/reporting";
  }

  const canApply = from.length > 0 && to.length > 0 && !pending;
  const rangeActive = Boolean(fromIso && toIso);

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border border-border/60 bg-muted/10 px-3 py-2">
      <div className="flex flex-col gap-1">
        <Label htmlFor="report-from" className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          From
        </Label>
        <input
          id="report-from"
          type="date"
          value={from}
          max={to || undefined}
          onChange={(e) => setFrom(e.target.value)}
          className="h-8 rounded-lg border border-input bg-background px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="report-to" className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          To
        </Label>
        <input
          id="report-to"
          type="date"
          value={to}
          min={from || undefined}
          onChange={(e) => setTo(e.target.value)}
          className="h-8 rounded-lg border border-input bg-background px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>
      <Button
        type="button"
        size="sm"
        disabled={!canApply}
        onClick={() =>
          startTransition(() => {
            router.push(buildHref({ from, to }));
          })
        }
      >
        Apply
      </Button>
      {rangeActive ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(() => {
              setFrom("");
              setTo("");
              router.push(buildHref(null));
            })
          }
        >
          All time
        </Button>
      ) : null}
      <p className="text-[11px] text-muted-foreground">
        Both dates are included in the report.
      </p>
    </div>
  );
}
