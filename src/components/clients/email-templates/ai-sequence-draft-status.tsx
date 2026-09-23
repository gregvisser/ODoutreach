"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  nextSequenceDraftPoll,
  type SequenceDraftPollStatus,
} from "@/lib/ai/sequence-draft-poll";

const GIVE_UP_MESSAGE =
  "The draft status could not be confirmed from this page. No further attempt was made. Refresh in a moment — if the drafts are here, use them; if they are not, you can try again.";

type View =
  | { phase: "pending" }
  | { phase: "done"; status: "SUCCEEDED" | "FAILED"; message: string | null }
  | { phase: "give-up" };

function isPollStatus(value: unknown): value is SequenceDraftPollStatus {
  return (
    value === "QUEUED" ||
    value === "RUNNING" ||
    value === "SUCCEEDED" ||
    value === "FAILED"
  );
}

/**
 * Follows one detached sequence draft. Polling stops on a terminal row or
 * after the page's own budget. It never submits the draft form again.
 */
export function AiSequenceDraftStatus({
  clientId,
  runId,
}: {
  clientId: string;
  runId: string;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>({ phase: "pending" });

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    let consecutiveFailures = 0;
    const startedAt = Date.now();

    async function tick(): Promise<void> {
      let response: { ok: true; status: SequenceDraftPollStatus; message: string | null } | { ok: false };
      try {
        const res = await fetch(
          `/api/clients/${encodeURIComponent(clientId)}/sequence-drafts/${encodeURIComponent(runId)}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          response = { ok: false };
        } else {
          const body: unknown = await res.json();
          const status =
            typeof body === "object" && body !== null && "status" in body
              ? body.status
              : undefined;
          const message =
            typeof body === "object" &&
            body !== null &&
            "message" in body &&
            (typeof body.message === "string" || body.message === null)
              ? body.message
              : null;
          if (!isPollStatus(status)) {
            response = { ok: false };
          } else {
            response = { ok: true, status, message };
          }
        }
      } catch {
        response = { ok: false };
      }

      if (cancelled) return;

      const step = nextSequenceDraftPoll({
        elapsedMs: Date.now() - startedAt,
        consecutiveFailures,
        response: response.ok ? { ok: true, status: response.status } : { ok: false },
      });

      if (step.action === "wait") {
        consecutiveFailures = step.consecutiveFailures;
        timer = window.setTimeout(() => {
          void tick();
        }, step.delayMs);
        return;
      }
      if (step.action === "give-up") {
        setView({ phase: "give-up" });
        return;
      }
      const message = response.ok ? response.message : null;
      setView({ phase: "done", status: step.status, message });
      router.refresh();
    }

    void tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [clientId, runId, router]);

  if (view.phase === "pending") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
      >
        Writing the sequence… This can take a minute. Nothing is sent, and each
        email stays a draft until a person approves it.
      </div>
    );
  }

  if (view.phase === "give-up") {
    return (
      <div
        role="status"
        className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
      >
        {GIVE_UP_MESSAGE}
      </div>
    );
  }

  const failed = view.status === "FAILED";
  return (
    <div
      role="status"
      className={
        failed
          ? "rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          : "rounded-md border border-emerald-300/60 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-200"
      }
    >
      {view.message ??
        (failed
          ? "The sequence could not be drafted. Nothing was saved."
          : "The sequence was drafted. Read and approve each email before it can be sent.")}
    </div>
  );
}
