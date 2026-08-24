"use client";

import { useState, useTransition } from "react";

import {
  confirmFamilyProposalAction,
  rejectFamilyProposalAction,
} from "@/app/(app)/clients/family-proposal-actions";
import { Button } from "@/components/ui/button";

export type ProposalView = {
  id: string;
  proposedDomain: string;
  seedDomain: string;
  fanIn: number;
  contactsAffected: number;
  evidence: string;
  copy: {
    headline: string;
    because: string;
    alsoPointHere: string;
    ifYouConfirm: string;
    ifYouReject: string;
    confirmLabel: string;
    rejectLabel: string;
  };
};

/**
 * Machine-found company links, waiting for a person to say yes or no.
 *
 * The machine only proposes. Nothing here is read by the send gate — a
 * suggestion blocks nothing until it is confirmed, and confirming is the only
 * path from a guess to a block.
 *
 * The design rests on this screen. The fan-in filter refuses a domain three or
 * more companies point at, but that is a filter, not a safeguard: `nhs.net` had
 * fan-in 2 in the real data and is still a shared service. If the wording does
 * not give the reader enough to say no, nothing else will.
 */
export function FamilyProposalPanel({
  clientId,
  proposals,
}: {
  clientId: string;
  proposals: ProposalView[];
}) {
  const [answered, setAnswered] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (proposals.length === 0) return null;

  const remaining = proposals.filter((p) => !answered[p.id]);

  function decide(proposal: ProposalView, decision: "confirm" | "reject") {
    setError(null);
    startTransition(async () => {
      const action =
        decision === "confirm" ? confirmFamilyProposalAction : rejectFamilyProposalAction;
      const result = await action({ clientId, proposalId: proposal.id });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAnswered((prev) => ({
        ...prev,
        [proposal.id]:
          decision === "confirm"
            ? `Added ${proposal.proposedDomain} to the do-not-contact list.`
            : `Noted — we will not ask about ${proposal.proposedDomain} again.`,
      }));
    });
  }

  return (
    <section className="space-y-3" aria-label="Suggested company links">
      <div>
        <h2 className="text-sm font-semibold text-foreground">
          Companies that may be the same
        </h2>
        <p className="text-xs text-muted-foreground">
          We checked the public email records each company publishes about itself.
          Nothing here is blocked until you say so.
        </p>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {remaining.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          All suggestions answered. Thank you.
        </p>
      ) : null}

      <ul className="space-y-3">
        {proposals.map((proposal) => {
          const done = answered[proposal.id];
          return (
            <li
              key={proposal.id}
              className="rounded-lg border border-border/80 bg-card/60 px-3 py-3"
            >
              {done ? (
                <p className="text-sm text-muted-foreground" role="status">
                  {done}
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    {proposal.copy.headline}
                  </p>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {proposal.copy.because}
                  </p>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {proposal.copy.alsoPointHere}
                  </p>
                  <p className="text-sm leading-relaxed text-foreground">
                    {proposal.copy.ifYouConfirm}
                  </p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {proposal.copy.ifYouReject}
                  </p>

                  <details className="rounded-md border border-border/60 bg-muted/20 px-2 py-1.5">
                    <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                      Show what we found
                    </summary>
                    <p className="mt-1.5 break-all font-mono text-[11px] leading-relaxed text-muted-foreground">
                      {proposal.evidence}
                    </p>
                  </details>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      type="button"
                      size="sm"
                      disabled={pending}
                      onClick={() => decide(proposal, "confirm")}
                    >
                      {proposal.copy.confirmLabel}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => decide(proposal, "reject")}
                    >
                      {proposal.copy.rejectLabel}
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
