"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type AdminConsentEntry = {
  /** The customer's email domain, e.g. "chevronsecurity.co.uk". */
  domain: string;
  /** Tenant-wide admin consent URL for that domain. */
  url: string;
};

function CopyButton({
  value,
  label = "Copy",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          /* clipboard blocked — user can select manually */
        }
      }}
    >
      {copied ? "Copied ✓" : label}
    </Button>
  );
}

function emailTemplate(domain: string, url: string): string {
  return `Hi,

Microsoft 365 will not let an outside application read or send email for a mailbox until someone with administrator rights has approved that application for the organisation. Many companies switch off the ability for ordinary staff to give that approval themselves, which is why the person connecting the mailbox sees "Need admin approval" and cannot continue.

So that OpensDoors can send and read email for our ${domain} mailbox, your Microsoft 365 / IT administrator needs to approve our app once. This is a standard one-time approval — it does not change any passwords, mailbox contents or security settings, and it can be withdrawn at any time.

Please ask your IT administrator to:
1. Open this link in a browser:
${url}
2. Sign in with their Microsoft 365 ADMIN account.
3. Review and click "Accept" to approve OpensDoors for the organisation.

They'll see a confirmation page when it's done. After that, we can connect the mailbox with no further prompts.

Thank you!`;
}

/**
 * Help panel for the "Need admin approval" wall a Microsoft 365 mailbox owner
 * hits when their organisation does not let ordinary staff approve outside
 * apps. Gives staff a ready-to-send admin-consent link + plain-English steps
 * for the customer's IT admin.
 *
 * On 2026-08-28 this moved to the always-present Setup help tab and stopped
 * returning null on an empty list: a client with no mailbox connected saw
 * nothing, which is exactly when these instructions are needed, because they
 * are how the mailbox gets connected.
 */
export function MicrosoftAdminConsentHelp({
  entries,
  unresolvedDomain = false,
}: {
  entries: AdminConsentEntry[];
  /**
   * True when we could not build a link — no domain on record, or Microsoft
   * OAuth is not configured. The panel still explains the problem rather than
   * vanishing.
   */
  unresolvedDomain?: boolean;
}) {
  if (entries.length === 0 && !unresolvedDomain) return null;

  return (
    <Card className="border-2 border-amber-500/70 bg-amber-50/70 shadow-sm dark:bg-amber-500/10">
      <CardHeader>
        <div className="mb-1 inline-flex w-fit items-center gap-1.5 rounded-full border border-amber-500/50 bg-amber-500/20 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-100">
          ⚠ Microsoft admin approval
        </div>
        <CardTitle className="text-xl font-bold">
          Microsoft mailbox shows &ldquo;Need admin approval&rdquo;?
        </CardTitle>
        <CardDescription className="text-foreground/80">
          Microsoft 365 will not let an outside application touch a mailbox until
          someone with administrator rights has approved that application for the
          whole organisation — and most companies do not let ordinary staff give that
          approval. That is all this screen means. It is{" "}
          <span className="font-semibold text-foreground">not</span> a wrong password
          and <span className="font-semibold text-foreground">not</span> a
          multi-factor problem, and nothing you change on the mailbox will clear it.
          Send the customer the link and steps below; their IT administrator approves
          OpensDoors once, and then every mailbox on that domain connects normally.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {entries.length === 0 ? (
          <div className="rounded-md border border-border/70 bg-muted/20 p-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">
              No approval link can be generated for this client yet.
            </p>
            <p className="mt-1">
              We need the customer&rsquo;s email domain first. Add their website on the{" "}
              <span className="font-medium">Brief</span> tab, or add a mailbox on the{" "}
              <span className="font-medium">Mailboxes</span> tab, and a ready-to-send
              approval link will appear here. If it still does not, the Microsoft
              connection is not configured on our side — tell an administrator.
            </p>
          </div>
        ) : null}
        {entries.map((entry) => (
          <div
            key={entry.domain}
            className="space-y-3 rounded-md border border-border/70 bg-muted/20 p-3"
          >
            <p className="text-sm font-medium">
              For mailboxes at{" "}
              <span className="font-mono">{entry.domain}</span>
            </p>

            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Approval link (give this to the customer&rsquo;s IT admin)
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded border border-border/60 bg-background px-2 py-1 text-xs">
                  {entry.url}
                </code>
                <CopyButton value={entry.url} label="Copy link" />
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Steps for the IT administrator
              </p>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                <li>Open the approval link above in a web browser.</li>
                <li>
                  Sign in with a Microsoft 365{" "}
                  <span className="font-medium text-foreground">administrator</span>{" "}
                  account (not a normal user).
                </li>
                <li>
                  Read the permissions, then click{" "}
                  <span className="font-medium text-foreground">Accept</span> to
                  approve for the whole organisation.
                </li>
                <li>
                  A &ldquo;OpensDoors is approved&rdquo; page confirms it&rsquo;s
                  done — they can close the window.
                </li>
              </ol>
            </div>

            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Prefer to email the customer? Copy a ready-made message:
              </p>
              <CopyButton
                value={emailTemplate(entry.domain, entry.url)}
                label="Copy email"
                className={cn("shrink-0")}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
