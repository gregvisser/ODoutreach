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
import type {
  ClientDeliverabilityEntry,
  ClientHelpDomainSource,
  MailboxProvider,
} from "@/lib/clients/client-help-domains";
import { cn } from "@/lib/utils";

/**
 * Deliverability help panel — the REAL fix for "outreach lands in spam":
 * finish the sending domain's standard email authentication (SPF, DKIM, DMARC)
 * on the domain the customer already owns. Replaces the old sender-aligned
 * `go.<domain>` link-domain card, which pushed an optional subdomain most
 * customers refused and which was never the main lever. No new subdomain is
 * required here.
 *
 * Two things changed on 2026-08-28, both because the owner reported staff
 * could not find this when they needed it:
 *  - it lives on its own Setup help tab, on EVERY client, not only on the
 *    Mailboxes tab of a client that already has a mailbox connected;
 *  - it never returns null. With no domain known it says what is missing.
 *
 * The prose says what each check is FOR before naming it — the staff using
 * this are not technical. The instructions themselves are deliberately left
 * technical and verbatim, because their value is that a non-technical person
 * can forward them to an IT department unchanged.
 */

export type { ClientDeliverabilityEntry, MailboxProvider };

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

Before Outlook and Gmail put a message in someone's inbox, they check whether the sending domain has proved it really sends its own email. Where that proof is missing or incomplete, genuine messages get treated as suspicious and land in spam.

There are three standard settings that provide that proof, and ${domain} needs all three finished. They protect ALL of your email — not just our outreach — and need no new subdomain and no change to how your mail works. Your IT team or whoever manages your DNS will recognise them:

${domain} sends via ${providerLabel(provider)}. Please make sure the following three are in place:

1) SPF — the list of services allowed to send email using ${domain}. Your SPF (TXT)
   record should authorise your sending platform and end in -all, e.g.:
   v=spf1 ${spfInclude(provider)} -all

2) DKIM — an invisible signature on every message, so the receiver can prove it
   genuinely came from ${domain} and was not altered on the way. Turn DKIM signing on:
${dkimEmailSteps(provider, domain)}

3) DMARC — your instruction to receiving mail servers about what to do when a message
   fails the two checks above, plus a report so you can see who is sending as you.
   Publish a DMARC record (TXT at host _dmarc.${domain}):
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
          1 · The list of services allowed to send as this domain — called SPF
        </p>
        <p className="text-sm text-muted-foreground">
          Without it, anyone can claim to be {domain} and the receiver has no way to
          tell. Their SPF (TXT) record should include their platform and end in{" "}
          <span className="font-mono">-all</span>:
        </p>
        <Rec label="TXT @" value={`v=spf1 ${spfInclude(provider)} -all`} />
      </div>

      {/* DKIM */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          2 · An invisible signature on every message — called DKIM (biggest win)
        </p>
        <p className="text-sm text-muted-foreground">
          It lets the receiver prove the message really came from {domain} and was
          not altered in transit. Turn signing on:
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
          3 · What to do when a message fails those checks — called DMARC
        </p>
        <p className="text-sm text-muted-foreground">
          This is the domain owner&rsquo;s instruction to receiving mail servers, and
          it also sends them a report of who is sending as them. Add a TXT record at
          host <span className="font-mono">_dmarc.{domain}</span> (monitor-only first
          — it can&rsquo;t hurt delivery):
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
  domainSource = "MAILBOXES",
}: {
  entries: ClientDeliverabilityEntry[];
  /** Where the domains came from — drives the caveat shown above them. */
  domainSource?: ClientHelpDomainSource;
}) {
  return (
    <Card className="border-2 border-emerald-500/60 bg-emerald-50/60 shadow-sm dark:bg-emerald-500/10">
      <CardHeader>
        <div className="mb-1 inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-500/50 bg-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-emerald-900 dark:text-emerald-100">
          📬 Getting outreach into the inbox, not spam
        </div>
        <CardTitle className="text-xl font-bold">
          Help this client&rsquo;s outreach reach the inbox
        </CardTitle>
        <CardDescription className="text-foreground/80">
          Before Outlook and Gmail deliver a message, they check whether the sending
          domain has <span className="font-semibold text-foreground">proved it really sends its own email</span>.
          Where that proof is missing, genuine messages get treated as suspicious and
          land in spam. Three standard settings provide it — their technical names are{" "}
          <span className="font-semibold text-foreground">SPF</span>,{" "}
          <span className="font-semibold text-foreground">DKIM</span> and{" "}
          <span className="font-semibold text-foreground">DMARC</span> — and they go on
          the domain the customer{" "}
          <span className="font-semibold text-foreground">already owns</span>. No new
          subdomain, no change to how their email works, and it protects their everyday
          mail too. You do not need to understand the records below: hand them to the
          customer&rsquo;s IT department, or press <em>Copy email</em> and send it on.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {entries.length === 0 ? (
          <div className="rounded-md border border-border/70 bg-muted/20 p-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">
              We don&rsquo;t know this client&rsquo;s email domain yet.
            </p>
            <p className="mt-1">
              Add their website on the <span className="font-medium">Brief</span> tab,
              or connect a mailbox on the{" "}
              <span className="font-medium">Mailboxes</span> tab, and the exact records
              to send their IT department will appear here, already filled in.
            </p>
          </div>
        ) : (
          <>
            {domainSource === "CLIENT_RECORD" ? (
              <p className="rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                No mailbox is connected yet, so this is based on the domain in the
                client&rsquo;s record. Steps for{" "}
                <span className="font-medium text-foreground">both</span> Microsoft 365
                and Google Workspace are shown — the customer&rsquo;s IT will know
                which they use. Everything else below is correct either way.
              </p>
            ) : null}
            {entries.map((entry) => (
              <DomainBlock key={entry.domain} entry={entry} />
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}
