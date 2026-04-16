"use client";

import { signIn } from "next-auth/react";

import { Button } from "@/components/ui/button";

/**
 * OAuth must start via signIn() (POST / CSRF), not GET /api/auth/signin/:provider —
 * Auth.js throws UnknownAction for GET + providerId when a custom pages.signIn is set.
 */
export function MicrosoftSignInButton({ callbackUrl }: { callbackUrl: string }) {
  return (
    <Button
      type="button"
      size="lg"
      className="w-full"
      onClick={() => signIn("microsoft-entra-id", { callbackUrl })}
    >
      Sign in with Microsoft
    </Button>
  );
}
