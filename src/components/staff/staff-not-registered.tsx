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
          <CardTitle>Not registered as staff</CardTitle>
          <CardDescription>
            Your Microsoft account signed in, but this app only allows users who exist in the
            staff directory. An administrator must create a{" "}
            <code className="rounded bg-muted px-1 text-xs">StaffUser</code> row for your work
            email (or run seed with your email / Entra object id) before you can use the console.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {email ? (
            <p className="font-mono text-sm text-muted-foreground">{email}</p>
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
