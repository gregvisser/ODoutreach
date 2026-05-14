"use client";

import { useState, useTransition } from "react";

import {
  getQueueStatusAction,
  processQueueAction,
  type QueueStatusResult,
  type ProcessQueueActionResult,
} from "@/app/(app)/operations/outbound/actions";

export function AdminQueueDrainPanel() {
  const [status, setStatus] = useState<QueueStatusResult | null>(null);
  const [result, setResult] = useState<ProcessQueueActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function refreshStatus() {
    setError(null);
    startTransition(async () => {
      try {
        const s = await getQueueStatusAction();
        setStatus(s);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load status");
      }
    });
  }

  function processQueue() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const r = await processQueueAction({ limit: 25 });
        setResult(r);
        const s = await getQueueStatusAction();
        setStatus(s);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to process queue");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button
          onClick={refreshStatus}
          disabled={isPending}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-muted disabled:opacity-50"
        >
          {isPending ? "Loading…" : "Refresh queue status"}
        </button>
      </div>

      {status && (
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <Stat label="Queued" value={status.queued} tone={status.queued > 0 ? "warning" : undefined} />
          <Stat label="Processing" value={status.processing} />
          <Stat label="Failed (total)" value={status.failedTotal} tone={status.failedTotal > 0 ? "error" : undefined} />
          <Stat label="Stale queued (>30m)" value={status.staleQueued} tone={status.staleQueued > 0 ? "error" : undefined} />
        </div>
      )}

      {status && status.queued > 0 && (
        <div className="rounded-md border border-amber-400/60 bg-amber-50/50 px-3 py-2 dark:bg-amber-950/30">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
            Process {Math.min(status.queued, 25)} queued emails now?
            This sends real email for queued rows only. Already-sent rows are skipped.
          </p>
          <button
            onClick={processQueue}
            disabled={isPending}
            className="mt-2 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-amber-700 disabled:opacity-50 dark:bg-amber-700 dark:hover:bg-amber-600"
          >
            {isPending ? "Processing…" : `Process queued emails (up to ${Math.min(status.queued, 25)})`}
          </button>
        </div>
      )}

      {result && (
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
          <p>
            <span className="font-medium">Claimed:</span> {result.claimed} ·{" "}
            <span className="font-medium">Completed:</span> {result.completed} ·{" "}
            <span className="font-medium">Errors:</span> {result.errors.length}
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-1 list-inside list-disc text-destructive">
              {result.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && (
        <p className="text-xs font-medium text-destructive">{error}</p>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warning" | "error";
}) {
  return (
    <div className="rounded-md border border-border/80 bg-card px-2 py-1.5 shadow-sm">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={`text-lg font-semibold tabular-nums ${
          tone === "warning"
            ? "text-amber-600"
            : tone === "error"
              ? "text-destructive"
              : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
