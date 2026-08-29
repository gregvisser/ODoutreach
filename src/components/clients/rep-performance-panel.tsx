import { explainClientRepPerformanceWithAiAction } from "@/app/(app)/clients/[clientId]/mailboxes/ai-rep-performance-actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { REP_PERFORMANCE_PROMPT_VERSION } from "@/lib/ai/rep-performance";
import {
  MIN_REP_SENDS,
  type RepComparison,
  type RepStat,
} from "@/lib/ai/rep-performance-evidence";
import type { StoredRepPerformanceReview } from "@/server/ai/explain-rep-performance";

/**
 * "How our senders compare" — the numbers, and the two honest caveats.
 *
 * THE COPY IN THIS FILE IS A SAFETY CONTROL, not decoration. A table of named
 * colleagues sorted by reply rate is evidence in a performance conversation
 * whatever the heading says, and there are two distinct ways it could mislead.
 * Both are handled here rather than hoped away.
 *
 * 1. A READER SEEING A DIFFERENCE THAT IS NOT THERE.
 *    Cold-outreach reply rates are low single digits, so two identical senders
 *    routinely land several points apart. Every row therefore carries the
 *    verdict of an actual significance test — "within normal variation" is
 *    printed on the row, not left for the reader to infer from a percentage.
 *
 * 2. A READER BLAMING THE PERSON.
 *    Nobody here writes their own copy — sequences belong to the client — and
 *    nobody chooses their own recipients or volume. So a difference between
 *    senders is a fact about a MAILBOX. The panel says this at the top, before
 *    the table, because by the time somebody has read the numbers they have
 *    already formed the wrong conclusion.
 */

const COMPARISON_LABEL: Record<RepComparison["kind"], string> = {
  above: "More replies than the rest — larger than chance",
  below: "Fewer replies than the rest — larger than chance",
  indistinguishable: "Within normal variation",
};

const BOUNCE_LABEL: Record<RepComparison["kind"], string | null> = {
  above: "Bouncing more than the rest — check this mailbox's domain",
  below: null,
  indistinguishable: null,
};

function comparisonClass(kind: RepComparison["kind"]): string {
  if (kind === "above") return "text-emerald-700 dark:text-emerald-500";
  if (kind === "below") return "text-amber-700 dark:text-amber-500";
  return "text-muted-foreground";
}

function formatWhen(value: Date): string {
  // Sliced from the ISO string rather than localised, to avoid a server/client
  // timezone hydration mismatch — the pattern this codebase already uses.
  return value.toISOString().slice(0, 16).replace("T", " ");
}

function EvidenceTable({ reps }: { reps: readonly RepStat[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
          <th className="py-1 pr-3 font-medium">Sender</th>
          <th className="py-1 pr-3 font-medium">Sent</th>
          <th className="py-1 pr-3 font-medium">Replies</th>
          <th className="py-1 pr-3 font-medium">Positive</th>
          <th className="py-1 pr-3 font-medium">Bounced</th>
          <th className="py-1 font-medium">What that means</th>
        </tr>
      </thead>
      <tbody>
        {reps.map((rep) => (
          <tr key={rep.mailboxIdentityId} className="border-t border-border/50 align-top">
            <td className="py-1.5 pr-3">{rep.label}</td>
            <td className="py-1.5 pr-3 tabular-nums">{rep.sent}</td>
            <td className="py-1.5 pr-3 tabular-nums">
              {rep.replied} ({rep.replyRatePercent}%)
            </td>
            <td className="py-1.5 pr-3 tabular-nums">
              {rep.positive} ({rep.positiveRatePercent}%)
            </td>
            <td className="py-1.5 pr-3 tabular-nums">
              {rep.bounced} ({rep.bounceRatePercent}%)
            </td>
            <td className="py-1.5">
              <span className={comparisonClass(rep.comparison.kind)}>
                {COMPARISON_LABEL[rep.comparison.kind]}
              </span>
              {BOUNCE_LABEL[rep.bounceComparison.kind] ? (
                <span className="block text-xs text-amber-700 dark:text-amber-500">
                  {BOUNCE_LABEL[rep.bounceComparison.kind]}
                </span>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ReviewBody({ review }: { review: StoredRepPerformanceReview }) {
  const oldPrompt = review.promptVersion !== REP_PERFORMANCE_PROMPT_VERSION;

  return (
    <div className="space-y-3 rounded-md border border-border/70 p-3">
      <p className="text-xs text-muted-foreground">
        Compared {formatWhen(review.createdAt)} from {review.totalSent} emails,{" "}
        {review.totalReplied} replies ({review.totalPositive} positive) over the
        last {review.lookbackDays} days.
      </p>
      {oldPrompt ? (
        <p className="text-xs text-muted-foreground">
          Written by an earlier version of this comparison, so it is not directly
          comparable with a newer one.
        </p>
      ) : null}

      {!review.anyDistinguishable ? (
        <p className="rounded border border-border/60 bg-muted/50 p-2 text-sm">
          <strong>No sender is measurably ahead or behind.</strong> The
          percentages below differ, but not by more than normal variation would
          produce on this many sends. Treat these senders as performing the same.
        </p>
      ) : null}

      <p className="text-sm">{review.summary}</p>

      {review.findings.length > 0 ? (
        <ul className="space-y-2">
          {review.findings.map((finding, index) => (
            <li
              key={`finding-${String(index)}`}
              className="rounded border border-border/60 p-2 text-sm"
            >
              <p className="font-medium">{finding.senderLabel}</p>
              <p className="mt-1 text-muted-foreground">{finding.observation}</p>
              {finding.likelyCauses.length > 0 ? (
                <>
                  <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Any of these could cause it
                  </p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
                    {finding.likelyCauses.map((cause, causeIndex) => (
                      <li key={`cause-${String(index)}-${String(causeIndex)}`}>
                        {cause}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              {finding.checkFirst ? (
                <p className="mt-2 text-sm">
                  <span className="font-medium">Check first: </span>
                  {finding.checkFirst}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {review.cautions.length > 0 ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            What this does not prove
          </p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {review.cautions.map((caution, index) => (
              <li key={`caution-${String(index)}`}>{caution}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {review.evidence.length > 0 ? (
        <details open>
          <summary className="cursor-pointer text-sm font-medium">
            The numbers this came from
          </summary>
          <div className="mt-2">
            <EvidenceTable reps={review.evidence} />
          </div>
        </details>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Only replies we could match back to a specific email are counted, so
        every sender here is undercounted a little. Senders with fewer than{" "}
        {MIN_REP_SENDS} emails of their own are left out entirely, because below
        that a reply rate is mostly luck.
      </p>
    </div>
  );
}

export function RepPerformancePanel({
  clientId,
  canMutate,
  aiEnabled,
  aiConfigured,
  review,
  flash,
}: {
  clientId: string;
  canMutate: boolean;
  aiEnabled: boolean;
  aiConfigured: boolean;
  review: StoredRepPerformanceReview | null;
  flash: { ok: string | null; error: string | null };
}) {
  return (
    <Card id="ai-sender-comparison" className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle>Compare our senders with AI</CardTitle>
        <CardDescription>
          Counts what each mailbox sent and what came back, checks whether the
          differences are bigger than normal variation, then asks the AI to
          explain only the ones that are.{" "}
          <strong>This compares mailboxes, not people.</strong> Everyone here
          sends the same copy to whichever prospects were queued when their
          mailbox was free, so a gap between senders is almost always something
          about the mailbox or its domain — authentication, reputation, warm-up
          — and not about the person. It changes no setting on any mailbox. If
          there is not enough sending to tell the senders apart, it says so and
          costs nothing. Each run is added to this client&apos;s AI spend.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {flash.ok ? (
          <p className="rounded-md bg-muted p-3 text-sm">{flash.ok}</p>
        ) : null}
        {flash.error ? (
          <p className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">
            {flash.error}
          </p>
        ) : null}

        {!aiEnabled ? (
          <p className="text-sm text-muted-foreground">
            AI features are currently switched off, so nothing can be analysed.
          </p>
        ) : !aiConfigured ? (
          <p className="text-sm text-muted-foreground">
            The AI is not configured on this environment yet, so nothing can be
            analysed. Ask an administrator to add the API key.
          </p>
        ) : !canMutate ? (
          <p className="text-sm text-muted-foreground">
            You do not have permission to run this for this client.
          </p>
        ) : (
          <form action={explainClientRepPerformanceWithAiAction}>
            <input type="hidden" name="clientId" value={clientId} />
            <FormSubmitButton
              variant="secondary"
              pendingLabel="Comparing the senders…"
            >
              {review ? "Compare them again" : "Compare our senders"}
            </FormSubmitButton>
          </form>
        )}

        {review ? <ReviewBody review={review} /> : null}
      </CardContent>
    </Card>
  );
}
