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

export function StaffInactive({ email }: { email: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <Card className="max-w-md border-border/80 shadow-lg">
        <CardHeader>
          <CardTitle>Staff access disabled</CardTitle>
          <CardDescription>
            Your account exists in the staff directory, but access is currently inactive. Contact an
            administrator if you believe this is a mistake.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="font-mono text-sm text-muted-foreground">{email}</p>
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
