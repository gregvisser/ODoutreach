"use client";

import { useState, useTransition } from "react";

import {
  confirmFamilyProposalAction,
  discoverFamilyProposalsAction,
  rejectFamilyProposalAction,
} from "@/app/(app)/clients/do-not-contact-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { resolveActionOutcome } from "@/lib/suppression/panel-action-outcome";
import type { PendingProposalView } from "@/server/suppression/family-proposals";

/**
 * Machine-found related domains, awaiting a yes or no.
 *
 * Each card states what confirming will DO — how many contacts it stops us
 * contacting — before the button is pressed, and says plainly that "no" is
 * final. The evidence is the company's own published record, shown verbatim
 * behind a disclosure so a sceptical operator can check the machine's working
 * rather than trust it.
 */
export function FamilyProposalPanel({
  clientId,
  proposals,
}: {
  clientId: string;
  proposals: PendingProposalView[];
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [decided, setDecided] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  // Set whenever an attempt failed, so the operator can re-run the exact thing
  // they pressed rather than having to work out what to press again.
  const [retry, setRetry] = useState<(() => void) | null>(null);

  function markDecided(id: string) {
    setDecided((prev) => new Set(prev).add(id));
  }

  /**
   * Every press goes through here. `resolveActionOutcome` also catches a
   * REJECTED action — a request production shed with 503 never resolves, and
   * before this the panel said nothing at all in that case.
   */
  function attempt<R extends { ok: true } | { ok: false; error: string }>(
    again: () => void,
    run: () => Promise<R>,
    describeSuccess: (result: Extract<R, { ok: true }>) => string,
  ) {
    if (pending) return;
    setRetry(null);
    startTransition(async () => {
      const outcome = await resolveActionOutcome(run, describeSuccess);
      setIsError(outcome.isError);
      setMessage(outcome.message);
      setRetry(outcome.retryable ? () => again : null);
    });
  }

  function confirm(p: PendingProposalView) {
    attempt(
      () => {
        confirm(p);
      },
      () => confirmFamilyProposalAction({ clientId, proposalId: p.id }),
      (r) => {
        markDecided(p.id);
        return `${r.proposedDomain} is now blocked as part of the same company. Nobody there will be contacted.`;
      },
    );
  }

  function reject(p: PendingProposalView) {
    attempt(
      () => {
        reject(p);
      },
      () => rejectFamilyProposalAction({ clientId, proposalId: p.id }),
      (r) => {
        markDecided(p.id);
        return `Noted — ${r.proposedDomain} is a different company. We won't ask again.`;
      },
    );
  }

  function runDiscovery() {
    if (pending) return;
    setMessage("Checking every company on this client's lists — this takes about a minute.");
    setIsError(false);
    attempt(runDiscovery, () => discoverFamilyProposalsAction({ clientId }), (r) =>
      r.created === 0
        ? `Checked ${String(r.contactDomainsChecked)} company domains. Nothing new to ask about — anything already answered is not asked twice.`
        : `Checked ${String(r.contactDomainsChecked)} company domains and found ${String(r.created)} new suggestion${r.created === 1 ? "" : "s"}. Refresh to see ${r.created === 1 ? "it" : "them"}.`,
    );
  }

  const outstanding = proposals.filter((p) => !decided.has(p.id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={runDiscovery} disabled={pending}>
          {pending ? "Checking…" : "Find related domains now"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Runs automatically each night as well.
        </span>
      </div>

      {message ? (
        isError ? (
          // role="alert" so the failure is announced, not just coloured.
          <div
            role="alert"
            className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3"
          >
            <p className="text-sm text-destructive">{message}</p>
            {retry ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={retry}
              >
                Try again
              </Button>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{message}</p>
        )
      ) : null}

      {outstanding.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No suggestions waiting. When a company on the do-not-contact list
          turns out to run another domain, it will appear here for you to
          approve.
        </p>
      ) : (
        <ul className="space-y-3">
          {outstanding.map((p) => (
            <li
              key={p.id}
              className="rounded-lg border border-border/60 p-4 space-y-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{p.copy.headline}</span>
                {p.contactsAffected > 0 ? (
                  <Badge variant="default">
                    {p.contactsAffected}{" "}
                    {p.contactsAffected === 1 ? "contact" : "contacts"}
                  </Badge>
                ) : (
                  <Badge variant="outline">Nobody affected today</Badge>
                )}
              </div>

              <p className="text-sm text-muted-foreground">{p.copy.because}</p>
              <p className="text-sm text-muted-foreground">{p.copy.alsoPointHere}</p>
              <p className="text-sm">{p.copy.ifYouConfirm}</p>
              <p className="text-xs text-muted-foreground">{p.copy.ifYouReject}</p>

              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none">
                  What we found
                </summary>
                <p className="mt-1 break-all font-mono">{p.evidence}</p>
              </details>

              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  disabled={pending}
                  onClick={() => confirm(p)}
                >
                  {p.copy.confirmLabel}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => reject(p)}
                >
                  {p.copy.rejectLabel}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
