"use client";

import { useEffect } from "react";

/**
 * Registers the PWA service worker (/sw.js) once the page has loaded.
 *
 * The worker only caches hashed, immutable static assets — never navigations,
 * API responses, or authenticated content — so it can't serve stale or
 * cross-user data. See public/sw.js. Registration is best-effort: the app
 * works fine without it.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      void navigator.serviceWorker.register("/sw.js").catch(() => {
        // best-effort — ignore registration failures
      });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
