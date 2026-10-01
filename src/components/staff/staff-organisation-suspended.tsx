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

export function StaffOrganisationSuspended({ organisationName }: { organisationName: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <Card className="max-w-md border-border/80 shadow-lg">
        <CardHeader>
          <CardTitle>Organisation suspended</CardTitle>
          <CardDescription>
            {organisationName} is suspended. Signing in is paused until a platform administrator
            turns it back on.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
