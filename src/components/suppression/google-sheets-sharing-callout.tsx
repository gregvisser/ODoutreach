"use client";

import { Button } from "@/components/ui/button";

type Props = {
  serviceAccountEmail: string;
  /** Optional id prefix so multiple callouts on one page have unique button labels for a11y */
  idPrefix?: string;
  /** Disable Copy while a server action is in flight */
  copyDisabled?: boolean;
};

/**
 * OpensDoors operators must see the exact Google service account email to share Sheets with.
 * Never displays private keys — only the public client_email.
 */
export function GoogleSheetsSharingCallout({
  serviceAccountEmail,
  idPrefix = "suppression-share",
  copyDisabled = false,
}: Props) {
  return (
    <div className="rounded-md border border-border/80 bg-muted/30 px-3 py-3 text-sm">
      <p className="font-medium text-foreground">Share this Google Sheet with:</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code
          className="break-all rounded bg-background px-2 py-1 text-xs"
          id={`${idPrefix}-email`}
        >
          {serviceAccountEmail}
        </code>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={copyDisabled}
          onClick={() => {
            void navigator.clipboard.writeText(serviceAccountEmail);
          }}
        >
          Copy email
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Role: Viewer.</span> Open the Sheet → Share →
        paste this email → Viewer → Send/Share.
      </p>
    </div>
  );
}
