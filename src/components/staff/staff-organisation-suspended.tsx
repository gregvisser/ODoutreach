"use client";

import { signOut } from "next-auth/react";

import { enterOrganisationAction } from "@/app/(app)/organisation/actions";
import { Button } from "@/components/ui/button";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function StaffOrganisationSuspended({
  organisationName,
  alternatives = [],
}: {
  organisationName: string;
  alternatives?: { id: string; name: string }[];
}) {
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
        <CardContent className="space-y-3">
          {alternatives.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                You can open another organisation you belong to.
              </p>
              {alternatives.map((organisation) => (
                <form key={organisation.id} action={enterOrganisationAction}>
                  <input type="hidden" name="organisationId" value={organisation.id} />
                  <FormSubmitButton pendingLabel="Opening…" variant="outline" className="w-full">
                    Open {organisation.name}
                  </FormSubmitButton>
                </form>
              ))}
            </div>
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
