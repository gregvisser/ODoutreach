"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/**
 * In-app "new reply" popup.
 *
 * Polls /api/notifications/replies (session-authed, tenant-scoped) every
 * POLL_MS and compares the newest linked reply against a per-browser
 * "last seen" watermark in localStorage. When a newer reply appears, a
 * toast pops in the bottom-right with a link to that client's Activity
 * page. Dismissing (or clicking through) advances the watermark.
 *
 * First poll with no stored watermark just records the current latest —
 * staff aren't spammed about old replies on first load.
 */

const POLL_MS = 60_000;
const STORAGE_KEY = "od.replyNotifier.lastSeen.v1";

type LatestReply = {
  id: string;
  receivedAtIso: string;
  fromEmail: string;
  subject: string | null;
  clientId: string;
  clientName: string;
};

type Watermark = { id: string; receivedAtIso: string };

function readWatermark(): Watermark | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Watermark;
    if (typeof parsed?.id === "string" && typeof parsed?.receivedAtIso === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function writeWatermark(w: Watermark): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(w));
  } catch {
    /* private mode etc. — notifier degrades to session-only */
  }
}

export function NewReplyNotifier() {
  const [toast, setToast] = useState<LatestReply | null>(null);
  // Session-scoped fallback watermark for when localStorage is unavailable.
  const sessionWatermark = useRef<Watermark | null>(null);

  useEffect(() => {
    let stopped = false;

    async function poll() {
      try {
        const res = await fetch("/api/notifications/replies", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const body = (await res.json()) as { latest: LatestReply | null };
        const latest = body.latest;
        if (stopped || !latest) return;

        const stored = readWatermark() ?? sessionWatermark.current;
        if (!stored) {
          // First ever poll in this browser: baseline silently.
          const w = { id: latest.id, receivedAtIso: latest.receivedAtIso };
          sessionWatermark.current = w;
          writeWatermark(w);
          return;
        }
        if (
          latest.id !== stored.id &&
          latest.receivedAtIso > stored.receivedAtIso
        ) {
          setToast(latest);
        }
      } catch {
        /* network blip — try again next tick */
      }
    }

    void poll();
    const t = setInterval(() => void poll(), POLL_MS);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, []);

  if (!toast) return null;

  const acknowledge = () => {
    const w = { id: toast.id, receivedAtIso: toast.receivedAtIso };
    sessionWatermark.current = w;
    writeWatermark(w);
    setToast(null);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 w-80 rounded-lg border border-emerald-400/60 bg-background p-4 shadow-lg"
    >
      <p className="text-sm font-semibold text-foreground">New reply received</p>
      <p className="mt-1 truncate text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{toast.fromEmail}</span>
        {" · "}
        {toast.clientName}
      </p>
      {toast.subject ? (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {toast.subject}
        </p>
      ) : null}
      <div className="mt-3 flex items-center gap-3">
        <Link prefetch={false}
          href={`/clients/${toast.clientId}/activity`}
          onClick={acknowledge}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          View reply
        </Link>
        <button
          type="button"
          onClick={acknowledge}
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
