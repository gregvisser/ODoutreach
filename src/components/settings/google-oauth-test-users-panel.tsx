"use client";

import { useActionState, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

import {
  addOauthTestUsersAction,
  type OauthTestUserActionResult,
} from "@/app/(app)/settings/google-oauth-test-users-action";

/**
 * Admin-only panel for adding Google OAuth consent screen test users.
 *
 * Attempts the internal Console GraphQL API first. If that fails (expected
 * if Google rejects service-account auth), shows the error with a direct
 * link to the GCP Console page so the admin can add them manually.
 *
 * The "current known users" textarea lets the admin paste the current list
 * so the SetTrustedUserList call (which is a full replace) merges safely.
 */
export function GoogleOauthTestUsersPanel({
  consoleUrl,
}: {
  consoleUrl: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [result, formAction, pending] = useActionState<
    OauthTestUserActionResult | null,
    FormData
  >(addOauthTestUsersAction, null);

  const [showCurrentField, setShowCurrentField] = useState(false);

  const hasError = result && !result.ok;
  const hasSuccess = result?.ok;
  const errorConsoleUrl = hasError ? result.consoleUrl : undefined;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Add Google Workspace email addresses as OAuth test users on this
        project&apos;s consent screen. Required while the app is in{" "}
        <span className="font-medium text-foreground">Testing</span> publishing
        status — only listed users can complete the Google sign-in flow.
      </p>

      <form ref={formRef} action={formAction} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="oauth-test-emails">Email addresses to add</Label>
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
            Accepts up to 100 addresses per submission.
          </p>
        </div>

        {showCurrentField && (
          <div className="space-y-1.5">
            <Label htmlFor="oauth-current-users">
              Current test users (paste from Google Cloud Console)
            </Label>
            <Textarea
              id="oauth-current-users"
              name="currentKnownUsers"
              rows={4}
              placeholder={
                "Paste the current list here so new users are merged safely.\n" +
                "Leave empty to set ONLY the new emails above."
              }
              disabled={pending}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              The Google API replaces the entire list, so existing users must be
              included to avoid removing them.{" "}
              <a
                href={consoleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline-offset-4 hover:underline"
              >
                View current list in Console
              </a>
            </p>
          </div>
        )}

        {!showCurrentField && (
          <input type="hidden" name="currentKnownUsers" value="" />
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending} size="sm">
            {pending ? "Adding…" : "Add test users"}
          </Button>
          {!showCurrentField && (
            <button
              type="button"
              onClick={() => setShowCurrentField(true)}
              className="text-xs text-primary underline-offset-4 hover:underline"
            >
              I have existing test users to preserve
            </button>
          )}
        </div>
      </form>

      {hasError && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive space-y-2"
        >
          <p>
            <span className="font-medium">Automatic add failed. </span>
            {result.error.split("\n")[0]}
          </p>
          <p className="text-xs">
            Add them manually instead:{" "}
            <a
              href={errorConsoleUrl ?? consoleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline underline-offset-4"
            >
              Open Google Cloud Console
            </a>
          </p>
        </div>
      )}

      {hasSuccess && (
        <div
          role="status"
          className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-100 space-y-1"
        >
          {result.added.length > 0 && (
            <p>
              <span className="font-medium">
                Added ({result.added.length}):
              </span>{" "}
              {result.added.join(", ")}
            </p>
          )}
          {result.alreadyPresent.length > 0 && (
            <p className="text-emerald-800/70 dark:text-emerald-200/70">
              <span className="font-medium">
                Already present ({result.alreadyPresent.length}):
              </span>{" "}
              {result.alreadyPresent.join(", ")}
            </p>
          )}
          {result.added.length === 0 && result.alreadyPresent.length > 0 && (
            <p>All submitted addresses were already in the list.</p>
          )}
          <p className="text-xs opacity-70">
            Total test users on consent screen: {result.total}
          </p>
        </div>
      )}

      <div className="border-t border-border/50 pt-3">
        <a
          href={consoleUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary underline-offset-4 hover:underline"
        >
          Manage test users directly in Google Cloud Console
        </a>
      </div>
    </div>
  );
}
