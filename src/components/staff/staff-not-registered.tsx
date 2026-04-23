"use client";

import { signOut } from "next-auth/react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** Microsoft sign-in succeeded, but there is no matching StaffUser row (and no email match to link). */
export function StaffNotRegistered({ email }: { email?: string | null }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <Card className="max-w-md border-border/80 shadow-lg">
        <CardHeader>
          <CardTitle>You&apos;re not on the access list yet</CardTitle>
          <CardDescription>
            Your Microsoft sign-in worked, but this account hasn&apos;t been
            added to OpensDoors Outreach. Ask an administrator to invite your
            work email from Settings → Staff access, then try again.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {email ? (
            <p className="text-sm text-muted-foreground">
              Signed in as <span className="font-medium text-foreground">{email}</span>
            </p>
          ) : null}
          <Button
            variant="outline"
            type="button"
            onClick={() => signOut({ callbackUrl: "/sign-in" })}
          >
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
