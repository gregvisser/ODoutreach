"use client";

/* eslint-disable react-hooks/set-state-in-effect --
   This prompt detects platform / installed-state on mount (client-only, with no
   SSR-safe render-time equivalent) and reflects it in state. Setting state in
   the mount effect is intentional here. */

import { Download, Share, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  isInstallPromptDismissed,
  recordInstallPromptDismissed,
  resolveDismissStorageKind,
  type InstallDismissStorageKind,
  type InstallDismissStores,
} from "@/lib/pwa/install-dismissal";

/** The Chrome/Android `beforeinstallprompt` event (not in the standard DOM lib). */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

/**
 * Reading `localStorage` / `sessionStorage` can itself throw (Safari private
 * browsing, enterprise policy), so probe once and hand null to the pure module.
 */
function readStores(): InstallDismissStores {
  const safely = (get: () => Storage): Storage | null => {
    try {
      return get();
    } catch {
      return null;
    }
  };
  if (typeof window === "undefined") return { local: null, session: null };
  return {
    local: safely(() => window.localStorage),
    session: safely(() => window.sessionStorage),
  };
}

/** Phones and tablets report a coarse primary pointer; a desktop mouse does not. */
function isTouchPrimary(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(pointer: coarse)").matches ?? false;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const displayStandalone =
    window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  const iosStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return displayStandalone || iosStandalone;
}

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOS =
    /iphone|ipad|ipod/i.test(ua) ||
    // iPadOS 13+ presents as desktop Safari but is a touch device.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const safari =
    /safari/i.test(ua) && !/crios|fxios|edgios|chrome|android/i.test(ua);
  return iOS && safari;
}

/**
 * In-app "install this app" prompt. Shows on every visit until the app is
 * installed, then hides automatically.
 *
 * - Android/desktop Chrome: captures `beforeinstallprompt`, suppresses Chrome's
 *   mini-infobar, and the button opens the real native install dialog.
 * - iOS/iPadOS Safari (no programmatic install exists): shows the manual
 *   "Share → Add to Home Screen" instructions.
 */
export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [iosHint, setIosHint] = useState(false);
  const dismissKind = useRef<InstallDismissStorageKind>("session");

  useEffect(() => {
    if (isStandalone()) return; // already installed — never prompt

    // On a desktop this resolves to localStorage, so "no" survives a new tab
    // and a browser restart. On a phone it stays per-visit, which is what the
    // standing PWA rule requires.
    const kind = resolveDismissStorageKind({ isTouchPrimary: isTouchPrimary() });
    dismissKind.current = kind;
    if (isInstallPromptDismissed(readStores(), kind)) return;

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault(); // suppress Chrome's mini-infobar; we drive the prompt
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setIosHint(false);
      setVisible(true);
    };
    const onAppInstalled = () => {
      setVisible(false);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    // iOS/iPadOS Safari never fires beforeinstallprompt and has no programmatic
    // install — show the manual "Add to Home Screen" instructions instead. This
    // is a one-time, client-only detection on mount (there is no SSR-safe
    // render-time equivalent), so setting state here is intentional.
    if (isIosSafari()) {
      setIosHint(true);
      setVisible(true);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    recordInstallPromptDismissed(readStores(), dismissKind.current);
    setVisible(false);
  };

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt(); // opens the real native install dialog
    try {
      await deferredPrompt.userChoice;
    } catch {
      // ignore
    }
    setDeferredPrompt(null);
    setVisible(false);
  };

  // Full-width along the bottom on a phone (where it is the whole point); on
  // anything wider it tucks into the bottom-RIGHT corner instead of sitting
  // centred over the page, which is how it came to cover the client-name
  // column of the /reporting table.
  return (
    <div
      role="dialog"
      aria-label="Install ODoutreach"
      className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:inset-x-auto sm:right-4 sm:bottom-4 sm:mx-0 sm:w-[22rem] sm:p-0"
    >
      <div className="flex items-start gap-3 rounded-xl border border-border bg-background/95 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">Install ODoutreach</p>
          {iosHint ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Tap the Share icon{" "}
              <Share className="inline size-3.5 align-[-2px]" aria-hidden />{" "}
              in Safari, then choose “Add to Home Screen”.
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Add it to your device for quick, full-screen access.
            </p>
          )}
          {!iosHint && (
            <div className="mt-2">
              <Button size="sm" onClick={install}>
                <Download aria-hidden />
                Install app
              </Button>
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={dismiss}
          aria-label="Dismiss install prompt"
        >
          <X aria-hidden />
        </Button>
      </div>
    </div>
  );
}
