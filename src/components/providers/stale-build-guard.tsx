"use client";

import { unstable_isUnrecognizedActionError } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { getClientBuildCommit } from "@/lib/stale-build/client-build-commit";
import { isUnrecognizedActionFailure } from "@/lib/stale-build/action-failure";
import {
  isStaleBuildInfo,
  STALE_BUILD_POLL_INTERVAL_MS,
} from "@/lib/stale-build/detect-stale-build";
import { confirmReloadWithDirtyForms } from "@/lib/stale-build/form-dirty";
import { fetchLiveBuildInfo } from "@/lib/stale-build/fetch-live-build-info";

type StaleBuildState = {
  visible: boolean;
  /** Set when a server action failed because the bundle is behind the server. */
  unsavedActionFailure: boolean;
};

function isStaleActionError(error: unknown): boolean {
  if (unstable_isUnrecognizedActionError(error)) return true;
  return isUnrecognizedActionFailure(error);
}

/**
 * Detects deploy skew between this tab's JS bundle and the running server.
 * Shows a lightweight reload banner; never auto-reloads while forms are dirty.
 */
export function StaleBuildGuard() {
  const clientCommit = useRef(getClientBuildCommit());
  const [state, setState] = useState<StaleBuildState>({
    visible: false,
    unsavedActionFailure: false,
  });
  const inFlight = useRef<Promise<void> | null>(null);

  const markStale = useCallback((unsavedActionFailure: boolean) => {
    setState((prev) => ({
      visible: true,
      unsavedActionFailure: prev.unsavedActionFailure || unsavedActionFailure,
    }));
  }, []);

  const runCheck = useCallback(async () => {
    if (!clientCommit.current) return;
    if (inFlight.current) {
      await inFlight.current;
      return;
    }
    const task = (async () => {
      try {
        const info = await fetchLiveBuildInfo();
        if (!info) return;
        if (isStaleBuildInfo(clientCommit.current, info)) {
          markStale(false);
        }
      } catch {
        // Ignore transient network failures — this guard must stay silent.
      } finally {
        inFlight.current = null;
      }
    })();
    inFlight.current = task;
    await task;
  }, [markStale]);

  useEffect(() => {
    if (!clientCommit.current) return;

    const onFocus = () => {
      void runCheck();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void runCheck();
    };

    void runCheck();
    const interval = window.setInterval(() => {
      void runCheck();
    }, STALE_BUILD_POLL_INTERVAL_MS);

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (!isStaleActionError(event.reason)) return;
      markStale(true);
    };

    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, [markStale, runCheck]);

  const reload = () => {
    if (!confirmReloadWithDirtyForms(document)) return;
    window.location.reload();
  };

  if (!state.visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="stale-build-banner"
      className="fixed inset-x-0 top-0 z-[60] border-b border-border bg-amber-50/95 px-3 py-2 text-sm text-amber-950 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-amber-50/90 dark:bg-amber-950/95 dark:text-amber-50"
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-2 gap-y-1">
        <p className="min-w-0 flex-1">
          {state.unsavedActionFailure ? (
            <>
              Your change was not saved because this tab is running an older
              version. Reload to continue.
            </>
          ) : (
            <>
              A new version of OpensDoors is available —{" "}
              <span className="sr-only">Reload the page using the button.</span>
            </>
          )}
        </p>
        <Button type="button" size="sm" variant="secondary" onClick={reload}>
          Reload
        </Button>
      </div>
    </div>
  );
}
