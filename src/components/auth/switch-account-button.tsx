"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SwitchAccountButton({ className }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function switchAccount() {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      // Start a fresh authenticated identity selection. Roles are resolved by
      // the existing server-side sign-in checks, never by the chosen email text.
      const result = await signIn(
        "microsoft-entra-id",
        { redirect: false, redirectTo: "/reporting" },
        { prompt: "select_account" },
      );
      if (!result?.ok || result.error || !result.url)
        throw new Error("Sign-in unavailable");
      window.location.assign(result.url);
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <div className={cn("relative", className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        disabled={busy}
        onClick={switchAccount}
      >
        {busy ? "Opening Microsoft…" : "Switch account"}
      </Button>
      {error ? (
        <p
          role="alert"
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-md border bg-background p-3 text-sm shadow-md"
        >
          Could not open Microsoft. Please try again.
        </p>
      ) : null}
    </div>
  );
}
