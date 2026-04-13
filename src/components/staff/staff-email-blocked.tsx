import { SignOutButton } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function StaffEmailBlocked({ email }: { email: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <Card className="max-w-md border-border/80 shadow-lg">
        <CardHeader>
          <CardTitle>Access restricted</CardTitle>
          <CardDescription>
            Your account is signed in, but this email is not permitted for OpensDoors staff
            access. Ask an administrator to add your domain to{" "}
            <code className="rounded bg-muted px-1 text-xs">STAFF_EMAIL_DOMAINS</code> or
            adjust Clerk.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="font-mono text-sm text-muted-foreground">{email}</p>
          <SignOutButton>
            <Button variant="outline" type="button">
              Sign out
            </Button>
          </SignOutButton>
        </CardContent>
      </Card>
    </div>
  );
}
