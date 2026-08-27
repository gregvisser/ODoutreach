"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * App-wide error boundary for the signed-in shell. Replaces Next's bare
 * "This page couldn't load" with a friendlier, branded recovery screen and
 * a Try again action. Logs to the browser console for support diagnosis.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error boundary:", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/10 text-2xl">
        ⚠
      </div>
      <h1 className="text-xl font-semibold tracking-tight">
        Something went wrong on this page
      </h1>
      <p className="text-sm text-muted-foreground">
        The action didn&apos;t complete. You can try again — if it keeps
        happening, log a Support ticket with what you were doing and a
        screenshot{error.digest ? ` (reference: ${error.digest})` : ""}.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button type="button" size="sm" onClick={() => reset()}>
          Try again
        </Button>
        <Link prefetch={false}
          href="/support"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Log a Support ticket →
        </Link>
      </div>
    </div>
  );
}
