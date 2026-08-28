"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setClientOpenTrackingAction } from "@/app/(app)/clients/open-tracking-actions";
import { verifyLinkDomainAction } from "@/app/(app)/clients/link-domain-actions";
import {
  OUTREACH_LINK_APP_HOST,
  OUTREACH_LINK_DOMAIN_VERIFY_ID,
} from "@/lib/clients/client-link-domain";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type Props = {
  clientId: string;
  canMutate: boolean;
  /** The customer's tracking domain, once recorded. */
  linkDomain: string | null;
  /** Whether that domain has been proved live (DNS + certificate + routed to us). */
  linkDomainVerified: boolean;
  /** Whether open tracking is currently ON for this customer. */
  trackingEnabled: boolean;
  /** `go.` subdomains derived from this client's connected mailbox domains. */
  candidateGoDomains: string[];
  /** True when OPEN_TRACKING_PIXEL is holding tracking off for every client. */
  globalKillSwitchEngaged: boolean;
};

/**
 * Per-client open tracking, off by default.
 *
 * Two steps, in order, because the second is meaningless without the first:
 * the customer adds a DNS record so tracking links sit on their own domain,
 * we prove it is live, and only then can tracking be switched on for them.
 */
export function ClientOpenTrackingCard({
  clientId,
  canMutate,
  linkDomain,
  linkDomainVerified,
  trackingEnabled,
  candidateGoDomains,
  globalKillSwitchEngaged,
}: Props) {
  const router = useRouter();
  const [goDomain, setGoDomain] = useState(linkDomain ?? candidateGoDomains[0] ?? "");
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const onVerify = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await verifyLinkDomainAction({ clientId, goDomain });
      setMessage({
        type: result.ok ? "ok" : "err",
        text: result.ok ? result.message : result.message,
      });
      if (result.ok) router.refresh();
    });
  };

  const onToggle = (enabled: boolean) => {
    setMessage(null);
    startTransition(async () => {
      const result = await setClientOpenTrackingAction({ clientId, enabled });
      setMessage({
        type: result.ok ? "ok" : "err",
        text: result.message,
      });
      if (result.ok) router.refresh();
    });
  };

  return (
    <section className="rounded-lg border border-border/80 bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Open tracking
        </p>
        <h2 className="text-lg font-semibold tracking-tight">
          Do this customer&rsquo;s emails record who opened them?
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Off for every customer unless it is switched on here. Open tracking adds a
          tiny invisible image to each email; when it loads, we record an open. It
          only works if the customer adds a DNS record so that image sits on their
          own web address &mdash; loading it from ours makes the email look like
          phishing and can send the whole campaign to junk.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span
          className={
            trackingEnabled
              ? "rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-sm font-medium text-amber-700 dark:text-amber-400"
              : "rounded-md border border-border/60 bg-muted/30 px-2.5 py-1 text-sm font-medium text-muted-foreground"
          }
        >
          {trackingEnabled ? "Tracking is ON for this customer" : "Tracking is OFF"}
        </span>
        {linkDomain ? (
          <span className="text-sm text-muted-foreground">
            Tracking domain: <span className="font-mono">{linkDomain}</span>{" "}
            {linkDomainVerified ? "— verified" : "— not verified yet"}
          </span>
        ) : null}
      </div>

      {globalKillSwitchEngaged ? (
        <p className="mt-3 max-w-3xl rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
          A system-wide setting is currently holding open tracking off for every
          customer, so no email carries a tracking image regardless of the switch
          below. Ask an administrator if this needs to change.
        </p>
      ) : null}

      {/* Step 1 — the customer's DNS. */}
      <div className="mt-5 space-y-3">
        <h3 className="text-sm font-semibold">
          Step 1 &mdash; the customer adds their tracking domain
        </h3>
        {linkDomainVerified ? (
          <p className="text-sm text-muted-foreground">
            Done. <span className="font-mono">{linkDomain}</span> is live and pointing
            at us, so tracking links would sit on the customer&rsquo;s own address.
          </p>
        ) : candidateGoDomains.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Connect a sending mailbox first &mdash; the tracking domain is derived from
            the customer&rsquo;s own sending address.
          </p>
        ) : (
          <>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Ask the customer&rsquo;s IT contact to add these two records to their DNS,
              then press Verify. Nothing changes for them until they do, and nothing is
              sent by pressing Verify.
            </p>
            <dl className="max-w-3xl space-y-1 rounded-md border border-border/60 bg-muted/20 p-3 font-mono text-xs">
              <div>
                <dt className="inline text-muted-foreground">CNAME </dt>
                <dd className="inline">
                  go &rarr; {OUTREACH_LINK_APP_HOST}
                </dd>
              </div>
              <div>
                <dt className="inline text-muted-foreground">TXT </dt>
                <dd className="inline break-all">
                  asuid.go &rarr; {OUTREACH_LINK_DOMAIN_VERIFY_ID}
                </dd>
              </div>
            </dl>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-2">
                <Label htmlFor="open-tracking-go-domain">Tracking domain</Label>
                <select
                  id="open-tracking-go-domain"
                  value={goDomain}
                  onChange={(e) => setGoDomain(e.target.value)}
                  className="h-8 w-full max-w-md rounded-lg border border-input bg-background px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {candidateGoDomains.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={onVerify}
                disabled={!canMutate || pending || !goDomain}
              >
                {pending ? "Checking…" : "Verify & enable domain"}
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Step 2 — the switch itself. */}
      <div className="mt-5 space-y-3">
        <h3 className="text-sm font-semibold">Step 2 &mdash; switch tracking on</h3>
        {!linkDomainVerified ? (
          <p className="text-sm text-muted-foreground">
            Not available until step 1 is done. Until then this customer&rsquo;s emails
            carry no tracking image at all.
          </p>
        ) : (
          <p className="max-w-3xl text-sm text-muted-foreground">
            Only switch this on if the customer has agreed to it. It changes what lands
            in a real prospect&rsquo;s inbox.
          </p>
        )}
        <Button
          type="button"
          variant={trackingEnabled ? "outline" : "default"}
          onClick={() => onToggle(!trackingEnabled)}
          disabled={!canMutate || pending || (!trackingEnabled && !linkDomainVerified)}
        >
          {pending
            ? "Saving…"
            : trackingEnabled
              ? "Switch tracking OFF"
              : "Switch tracking ON for this customer"}
        </Button>
      </div>

      {!canMutate ? (
        <p className="mt-4 text-sm text-muted-foreground">
          You do not have permission to change this workspace&rsquo;s tracking setting.
        </p>
      ) : null}

      {message ? (
        <p
          className={
            message.type === "ok"
              ? "mt-4 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400"
              : "mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          }
        >
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
