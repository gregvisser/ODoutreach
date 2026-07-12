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

/**
 * Deliverability help panel shown on the Mailboxes page — the REAL fix for
 * "outreach lands in spam": finish the sending domain's standard email
 * authentication (SPF, DKIM, DMARC) on the domain the customer already owns.
 * Replaces the old sender-aligned `go.<domain>` link-domain card, which pushed
 * an optional subdomain most customers refused and which was never the main
 * lever. No new subdomain is required here.
 */

export type MailboxProvider = "MICROSOFT" | "GOOGLE" | "MIXED";

export type ClientDeliverabilityEntry = {
  /** The customer's sending domain, e.g. "paratus365.com". */
  domain: string;
  /** How this domain's connected mailbox(es) send. */
  provider: MailboxProvider;
};

function providerLabel(provider: MailboxProvider): string {
  if (provider === "MICROSOFT") return "Microsoft 365";
  if (provider === "GOOGLE") return "Google Workspace";
  return "Microsoft 365 & Google Workspace";
}

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

/** SPF include a domain needs for its sending platform. */
function spfInclude(provider: MailboxProvider): string {
  if (provider === "GOOGLE") return "include:_spf.google.com";
  return "include:spf.protection.outlook.com";
}

/** Provider-specific DKIM enablement lines for the ready-made email. */
function dkimEmailSteps(provider: MailboxProvider, domain: string): string {
  const microsoft = `   Microsoft 365: go to https://security.microsoft.com/dkimv2 (sign in as an admin),
   select ${domain} → Create DKIM keys → add the two CNAME records it shows at your
   DNS host, then switch "Sign messages for this domain with DKIM signatures" to On.`;
  const google = `   Google Workspace: go to admin.google.com → Apps → Google Workspace → Gmail →
   Authenticate email → select ${domain} → Generate new record (2048-bit) → add the
   TXT record it shows at your DNS host → click Start authentication.`;
  if (provider === "MICROSOFT") return microsoft;
  if (provider === "GOOGLE") return google;
  return `${microsoft}\n${google}`;
}

function emailTemplate(entry: ClientDeliverabilityEntry): string {
  const { domain, provider } = entry;
  return `Hi,

To keep our outreach from ${domain} landing in inboxes rather than spam, the domain needs its standard email authentication finished: SPF, DKIM and DMARC. These protect ALL of your email — not just our outreach — and do not require any new subdomain or change to how your mail works.

${domain} sends via ${providerLabel(provider)}. Please make sure the following three are in place:

1) SPF — your SPF (TXT) record should authorise your sending platform and end in -all, e.g.:
   v=spf1 ${spfInclude(provider)} -all

2) DKIM — turn on DKIM signing for ${domain}:
${dkimEmailSteps(provider, domain)}

3) DMARC — publish a DMARC record (TXT at host _dmarc.${domain}):
   v=DMARC1; p=none; rua=mailto:dmarc@${domain}
   (starts in monitor-only so it can't affect delivery; raise to quarantine later.)

Let us know once these are done and we'll confirm on our side. Thank you!`;
}

function Rec({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded border border-border/60 bg-background p-2 font-mono text-xs">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <code className="min-w-0 flex-1 break-all">{value}</code>
      <CopyButton value={value} label="Copy" className="shrink-0 font-sans" />
    </div>
  );
}

function DomainBlock({ entry }: { entry: ClientDeliverabilityEntry }) {
  const { domain, provider } = entry;
  const isMs = provider !== "GOOGLE"; // Microsoft or Mixed → show the M365 path
  const isGoogle = provider !== "MICROSOFT"; // Google or Mixed → show the Google path

  return (
    <div className="space-y-3 rounded-md border border-border/70 bg-muted/20 p-3">
      <p className="text-sm font-medium">
        For <span className="font-mono">{domain}</span>{" "}
        <span className="text-muted-foreground">
          — sends via {providerLabel(provider)}
        </span>
      </p>

      {/* SPF */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          1 · SPF — authorise the sending platform
        </p>
        <p className="text-sm text-muted-foreground">
          Their SPF (TXT) record should include their platform and end in{" "}
          <span className="font-mono">-all</span>:
        </p>
        <Rec label="TXT @" value={`v=spf1 ${spfInclude(provider)} -all`} />
      </div>

      {/* DKIM */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          2 · DKIM — turn on signing (biggest win)
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          {isMs ? (
            <li>
              <span className="font-medium text-foreground">Microsoft 365:</span>{" "}
              <span className="font-mono">security.microsoft.com/dkimv2</span> →
              select {domain} → <strong>Create DKIM keys</strong> → add the two
              CNAMEs it shows at DNS → switch{" "}
              <em>&ldquo;Sign messages… with DKIM&rdquo;</em> to On.
            </li>
          ) : null}
          {isGoogle ? (
            <li>
              <span className="font-medium text-foreground">
                Google Workspace:
              </span>{" "}
              <span className="font-mono">admin.google.com</span> → Apps → Gmail →
              Authenticate email → <strong>Generate new record</strong> → add the
              TXT record → Start authentication.
            </li>
          ) : null}
        </ol>
      </div>

      {/* DMARC */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          3 · DMARC — publish a policy
        </p>
        <p className="text-sm text-muted-foreground">
          Add a TXT record at host{" "}
          <span className="font-mono">_dmarc.{domain}</span> (monitor-only first —
          it can&rsquo;t hurt delivery):
        </p>
        <Rec
          label="TXT _dmarc"
          value={`v=DMARC1; p=none; rua=mailto:dmarc@${domain}`}
        />
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
        <p className="text-xs text-muted-foreground">
          Send the customer&rsquo;s IT a ready-made message with all three:
        </p>
        <CopyButton
          value={emailTemplate(entry)}
          label="Copy email"
          className={cn("shrink-0")}
        />
      </div>
    </div>
  );
}

export function ClientDeliverabilityHelp({
  entries,
}: {
  entries: ClientDeliverabilityEntry[];
}) {
  if (entries.length === 0) return null;

  return (
    <Card className="border-2 border-emerald-500/60 bg-emerald-50/60 shadow-sm dark:bg-emerald-500/10">
      <CardHeader>
        <div className="mb-1 inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-500/50 bg-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-emerald-900 dark:text-emerald-100">
          📬 Email deliverability
        </div>
        <CardTitle className="text-xl font-bold">
          Help this client&rsquo;s outreach reach the inbox
        </CardTitle>
        <CardDescription className="text-foreground/80">
          What keeps outreach out of spam is finishing the sending domain&rsquo;s
          standard authentication — <span className="font-semibold text-foreground">SPF</span>,{" "}
          <span className="font-semibold text-foreground">DKIM</span> and{" "}
          <span className="font-semibold text-foreground">DMARC</span> — on the
          domain the customer <span className="font-semibold text-foreground">already owns</span>.
          No new subdomain needed. Hand their IT the records below, or copy a
          ready-made email. This also protects their everyday email.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {entries.map((entry) => (
          <DomainBlock key={entry.domain} entry={entry} />
        ))}
      </CardContent>
    </Card>
  );
}
