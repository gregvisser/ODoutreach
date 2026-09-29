"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  nextSequenceDraftPoll,
  type SequenceDraftPollStatus,
} from "@/lib/ai/sequence-draft-poll";

const GIVE_UP_MESSAGE =
  "The review could not be confirmed from this page. Nothing further was started. Refresh in a moment — if a score is shown below, use it; if it is not, you can try again.";

type View =
  | { phase: "pending" }
  | { phase: "done"; failed: boolean; message: string }
  | { phase: "give-up" };

function isAttemptState(value: unknown): value is "pending" | "succeeded" | "failed" {
  return value === "pending" || value === "succeeded" || value === "failed";
}

/**
 * Follows one detached campaign review. The poll stops on a finished call or
 * after the same clock as sequence drafting. It never starts another review.
 */
export function AiCampaignReviewStatus({
  clientId,
  sequenceId,
  since,
}: {
  clientId: string;
  sequenceId: string;
  since: string;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>({ phase: "pending" });

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    let consecutiveFailures = 0;
    const startedAt = Date.now();

    async function tick(): Promise<void> {
      let response:
        | { ok: true; status: SequenceDraftPollStatus; message: string | null }
        | { ok: false };
      try {
        const params = new URLSearchParams({ sequenceId, since });
        const res = await fetch(
          `/api/clients/${encodeURIComponent(clientId)}/campaign-review-status?${params.toString()}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          response = { ok: false };
        } else {
          const body: unknown = await res.json();
          const state =
            typeof body === "object" && body !== null && "state" in body ? body.state : undefined;
          const message =
            typeof body === "object" &&
            body !== null &&
            "message" in body &&
            typeof body.message === "string"
              ? body.message
              : null;
          if (!isAttemptState(state)) {
            response = { ok: false };
          } else {
            const status: SequenceDraftPollStatus =
              state === "pending" ? "RUNNING" : state === "succeeded" ? "SUCCEEDED" : "FAILED";
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
      const failed = step.status === "FAILED";
      setView({
        phase: "done",
        failed,
        message:
          (response.ok ? response.message : null) ??
          (failed
            ? "The campaign could not be reviewed. Nothing was saved."
            : "The review is ready — read it below."),
      });
      router.refresh();
    }

    void tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [clientId, sequenceId, since, router]);

  if (view.phase === "pending") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
      >
        Reading the campaign… This can take a few minutes. Nothing is changed,
        and nothing is sent.
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

  return (
    <div
      role="status"
      className={
        view.failed
          ? "rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          : "rounded-md border border-emerald-300/60 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-200"
      }
    >
      {view.message}
    </div>
  );
}
