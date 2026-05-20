"use client";

import { useActionState, useCallback, useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import {
  addOauthTestUsersAction,
  listOauthTestUsersAction,
  type OauthTestUserActionResult,
} from "@/app/(app)/settings/google-oauth-test-users-action";

export function GoogleOauthTestUsersPanel() {
  const formRef = useRef<HTMLFormElement>(null);
  const [result, formAction, pending] = useActionState<
    OauthTestUserActionResult | null,
    FormData
  >(addOauthTestUsersAction, null);

  const [currentUsers, setCurrentUsers] = useState<string[] | null>(null);
  const [listPending, startListTransition] = useTransition();
  const [listError, setListError] = useState<string | null>(null);

  const loadCurrentUsers = useCallback(() => {
    startListTransition(async () => {
      setListError(null);
      const r = await listOauthTestUsersAction();
      if (r.ok) {
        setCurrentUsers(r.emails);
      } else {
        setListError(r.error);
      }
    });
  }, []);

  // Clear textarea on successful add
  useEffect(() => {
    if (result?.ok && result.added.length > 0) {
      formRef.current?.reset();
      loadCurrentUsers();
    }
  }, [result, loadCurrentUsers]);

  const hasError = result && !result.ok;
  const hasSuccess = result?.ok;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Add Google Workspace email addresses as OAuth test users on this project&apos;s
        consent screen. Required while the app is in{" "}
        <span className="font-medium text-foreground">Testing</span> publishing
        status — only listed users can complete the Google sign-in flow.
      </p>

      <form ref={formRef} action={formAction} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="oauth-test-emails">Email addresses</Label>
          <Textarea
            id="oauth-test-emails"
            name="emails"
            rows={4}
            placeholder={
              "One email per line, or comma-separated:\ntaylor@example.com\njoe@example.com"
            }
            disabled={pending}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Accepts up to 100 addresses per submission. Duplicates are skipped automatically.
          </p>
        </div>

        <Button type="submit" disabled={pending} size="sm">
          {pending ? "Adding…" : "Add test users"}
        </Button>
      </form>

      {hasError && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <span className="font-medium">Error: </span>
          {result.error}
        </div>
      )}

      {hasSuccess && (
        <div
          role="status"
          className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-100 space-y-1"
        >
          {result.added.length > 0 && (
            <p>
              <span className="font-medium">Added ({result.added.length}):</span>{" "}
              {result.added.join(", ")}
            </p>
          )}
          {result.alreadyPresent.length > 0 && (
            <p className="text-emerald-800/70 dark:text-emerald-200/70">
              <span className="font-medium">Already present ({result.alreadyPresent.length}):</span>{" "}
              {result.alreadyPresent.join(", ")}
            </p>
          )}
          {result.added.length === 0 && result.alreadyPresent.length > 0 && (
            <p>All submitted addresses were already registered as test users.</p>
          )}
          <p className="text-xs opacity-70">
            Total test users on consent screen: {result.total}
          </p>
        </div>
      )}

      <div className="border-t border-border/50 pt-3">
        <button
          type="button"
          onClick={loadCurrentUsers}
          disabled={listPending}
          className={cn(
            "text-xs text-primary underline-offset-4 hover:underline disabled:opacity-50",
          )}
        >
          {listPending ? "Loading…" : "Show current test users"}
        </button>

        {listError && (
          <p className="mt-2 text-xs text-destructive">{listError}</p>
        )}

        {currentUsers !== null && !listError && (
          <div className="mt-2 space-y-1">
            {currentUsers.length === 0 ? (
              <p className="text-xs text-muted-foreground">No test users registered yet.</p>
            ) : (
              <ul className="space-y-0.5">
                {currentUsers.map((email) => (
                  <li key={email} className="font-mono text-xs text-muted-foreground">
                    {email}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
