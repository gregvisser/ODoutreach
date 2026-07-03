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

// OpensDoors app infrastructure (stable; not secret). The customer CNAMEs
// go.<domain> to the app and adds the asuid TXT so Azure can verify ownership
// and issue a TLS certificate for the subdomain.
const APP_HOST = "app-opensdoors-outreach-prod.azurewebsites.net";
const DOMAIN_VERIFY_ID =
  "7B9435585C43845C742978D69DD1DD59B642C267C70449C9730A024E7F365181";

export type OutreachLinkDomainEntry = {
  /** The customer's sending domain, e.g. "paratus365.com". */
  domain: string;
  /** The sender-aligned link subdomain, e.g. "go.paratus365.com". */
  goDomain: string;
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

function emailTemplate(domain: string, goDomain: string): string {
  return `Hi,

To keep our outreach emails landing in inboxes rather than spam, we host the unsubscribe and tracking links on a subdomain of your own domain — ${goDomain} — so everything stays on your brand. Your IT / DNS administrator just needs to add two DNS records once. This does not affect your normal email.

Please add the following two DNS records for ${domain}:

1) CNAME record
   Type:  CNAME
   Host / Name:  go        (this creates ${goDomain})
   Value / Points to:  ${APP_HOST}

2) TXT record (verifies ownership so a security certificate can be issued)
   Type:  TXT
   Host / Name:  asuid.go   (i.e. asuid.${goDomain})
   Value:  ${DOMAIN_VERIFY_ID}

Once these are live (usually within an hour), let us know and we'll switch it on for ${domain}.

Thank you!`;
}

function DnsRecord({
  recordType,
  host,
  hostNote,
  value,
}: {
  recordType: string;
  host: string;
  hostNote: string;
  value: string;
}) {
  return (
    <div className="space-y-1 rounded border border-border/60 bg-background p-2 font-mono text-xs">
      <div>
        <span className="text-muted-foreground">Type:&nbsp;</span>
        {recordType}
      </div>
      <div>
        <span className="text-muted-foreground">Host:&nbsp;</span>
        {host}{" "}
        <span className="font-sans text-muted-foreground">({hostNote})</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-muted-foreground">Value:</span>
        <code className="min-w-0 flex-1 truncate">{value}</code>
        <CopyButton value={value} label="Copy" className="font-sans" />
      </div>
    </div>
  );
}

/**
 * Help panel shown on the Mailboxes page: the two DNS records a customer's IT
 * admin adds so this client's outreach unsubscribe + tracking links are served
 * from a subdomain of the customer's OWN domain (go.<domain>). Aligning the
 * links with the sending domain is what keeps outreach out of spam/quarantine.
 * Staff hand the records — or a ready-made email — to the customer.
 */
export function OutreachLinkDomainHelp({
  entries,
}: {
  entries: OutreachLinkDomainEntry[];
}) {
  if (entries.length === 0) return null;

  return (
    <Card className="border-2 border-sky-500/70 bg-sky-50/70 shadow-sm dark:bg-sky-500/10">
      <CardHeader>
        <div className="mb-1 inline-flex w-fit items-center gap-1.5 rounded-full border border-sky-500/50 bg-sky-500/20 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-sky-900 dark:text-sky-100">
          🔗 Sender-aligned links (deliverability)
        </div>
        <CardTitle className="text-xl font-bold">
          Set up the customer&rsquo;s outreach link domain (go.&hellip;)
        </CardTitle>
        <CardDescription className="text-foreground/80">
          So outreach lands in the inbox and not spam, the unsubscribe and
          tracking links must sit on a subdomain of the customer&rsquo;s{" "}
          <span className="font-semibold text-foreground">own</span> domain.
          Send the customer the two DNS records below; their IT / DNS admin adds
          them once, then we switch it on for that domain. Their normal email is
          unaffected.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {entries.map((entry) => (
          <div
            key={entry.domain}
            className="space-y-3 rounded-md border border-border/70 bg-muted/20 p-3"
          >
            <p className="text-sm font-medium">
              For <span className="font-mono">{entry.domain}</span> — link
              domain <span className="font-mono">{entry.goDomain}</span>
            </p>

            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                DNS record 1 — CNAME
              </p>
              <DnsRecord
                recordType="CNAME"
                host="go"
                hostNote={`creates ${entry.goDomain}`}
                value={APP_HOST}
              />
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                DNS record 2 — TXT (ownership, for the security certificate)
              </p>
              <DnsRecord
                recordType="TXT"
                host="asuid.go"
                hostNote={`i.e. asuid.${entry.goDomain}`}
                value={DOMAIN_VERIFY_ID}
              />
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Steps for the IT / DNS administrator
              </p>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                <li>
                  Add the CNAME record above for{" "}
                  <span className="font-mono text-foreground">
                    {entry.goDomain}
                  </span>
                  .
                </li>
                <li>
                  Add the TXT record above for{" "}
                  <span className="font-mono text-foreground">
                    asuid.{entry.goDomain}
                  </span>
                  .
                </li>
                <li>
                  Save — DNS usually updates within an hour. Nothing else
                  changes; normal email is unaffected.
                </li>
                <li>Tell us when it&rsquo;s done and we&rsquo;ll switch it on.</li>
              </ol>
            </div>

            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Prefer to email the customer? Copy a ready-made message:
              </p>
              <CopyButton
                value={emailTemplate(entry.domain, entry.goDomain)}
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
