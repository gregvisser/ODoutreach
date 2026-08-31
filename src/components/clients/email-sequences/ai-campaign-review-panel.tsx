import { reviewClientCampaignWithAiAction } from "@/app/(app)/clients/[clientId]/outreach/ai-campaign-review-actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import {
  CAMPAIGN_REVIEW_PROMPT_VERSION,
  scoreBand,
  type CampaignReviewFinding,
} from "@/lib/ai/campaign-review";
import {
  isMostRecentlyReviewed,
  orderSequencesByReviewRecency,
} from "@/lib/ai/campaign-review-display-order";
import type { StoredCampaignReview } from "@/server/ai/review-campaign";

/**
 * "Review this campaign with AI" — the score and critique, on the Outreach tab.
 *
 * THE COPY IN THIS FILE IS A SAFETY CONTROL, not decoration.
 *
 * This panel puts a number out of 100 on the same screen as the button that
 * sends real email to strangers from a real client's domain. The single way
 * this feature does harm is an operator reading "82 / 100" as "checked, safe to
 * send". So the panel says, in the heading, in the description, and again under
 * every score, that this is an opinion about the WRITING and that it changes
 * nothing about whether the campaign may be launched.
 *
 * It is also careful to say when a review is STALE. A score written against a
 * campaign that has since been edited is worse than no score, because it looks
 * current.
 */

const SEVERITY_LABEL: Record<CampaignReviewFinding["severity"], string> = {
  high: "Worth fixing",
  medium: "Worth a look",
  low: "Minor",
};

const AREA_LABEL: Record<string, string> = {
  subject: "Subject line",
  opening: "Opening",
  relevance: "Relevance",
  length: "Length",
  call_to_action: "The ask",
  tone: "Tone",
  personalisation: "Personalisation",
  sequence_flow: "Flow across the emails",
  compliance: "Compliance",
  other: "General",
};

function formatWhen(value: Date): string {
  // Sliced from the ISO string rather than localised, to avoid a server/client
  // timezone hydration mismatch — the pattern this codebase already uses.
  return value.toISOString().slice(0, 16).replace("T", " ");
}

function ReviewBody({
  review,
  currentStepCount,
  defaultOpen,
}: {
  review: StoredCampaignReview;
  currentStepCount: number;
  /** Row 133 finding 1 — only the most recently reviewed sequence starts open. */
  defaultOpen: boolean;
}) {
  const band = scoreBand(review.score);
  const changedSince = review.stepCount !== currentStepCount;
  const oldPrompt = review.promptVersion !== CAMPAIGN_REVIEW_PROMPT_VERSION;

  return (
    <details
      open={defaultOpen}
      className="space-y-3 rounded-md border border-border/70 p-3"
    >
      <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-3 gap-y-1 [&::-webkit-details-marker]:hidden">
        <span className="text-2xl font-semibold tabular-nums">
          {review.score}
          <span className="text-base font-normal text-muted-foreground"> / 100</span>
        </span>
        <span className="text-sm font-medium">{band.label}</span>
        <span className="text-xs text-muted-foreground">
          Reviewed {formatWhen(review.createdAt)}
        </span>
      </summary>

      {changedSince ? (
        <p className="text-sm font-medium text-amber-700 dark:text-amber-500">
          This campaign has been changed since it was reviewed — it had{" "}
          {review.stepCount} email{review.stepCount === 1 ? "" : "s"} then and{" "}
          {currentStepCount} now. Review it again for an up-to-date score.
        </p>
      ) : null}
      {oldPrompt ? (
        <p className="text-xs text-muted-foreground">
          Written by an earlier version of the reviewer, so it is not directly
          comparable with newer scores.
        </p>
      ) : null}

      <p className="text-sm">{review.summary}</p>

      {review.findings.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          The AI listed nothing it would change.
        </p>
      ) : (
        <ul className="space-y-2">
          {review.findings.map((finding, index) => (
            <li
              key={`${finding.area}-${String(index)}`}
              className="rounded border border-border/60 p-2 text-sm"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {SEVERITY_LABEL[finding.severity]} ·{" "}
                {AREA_LABEL[finding.area] ?? AREA_LABEL.other}
              </p>
              <p className="mt-1">{finding.finding}</p>
              {finding.suggestion ? (
                <p className="mt-1 text-muted-foreground">{finding.suggestion}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        An opinion about the writing. It does not approve any email and does not
        affect whether this campaign can be launched.
      </p>
    </details>
  );
}

export function AiCampaignReviewPanel({
  clientId,
  canMutate,
  aiEnabled,
  aiConfigured,
  sequences,
  reviewsBySequenceId,
  flash,
}: {
  clientId: string;
  canMutate: boolean;
  aiEnabled: boolean;
  aiConfigured: boolean;
  sequences: ReadonlyArray<{
    id: string;
    name: string;
    stepCount: number;
  }>;
  reviewsBySequenceId: ReadonlyMap<string, StoredCampaignReview>;
  flash: { ok: string | null; error: string | null };
}) {
  // Row 133 finding 1 — the most recently reviewed sequence floats to the
  // top and starts expanded; every other review starts collapsed, so
  // grading several sequences no longer turns the panel into one long
  // screen the operator has to hunt through for the one they just graded.
  const reviewedAtBySequenceId = new Map(
    [...reviewsBySequenceId.entries()].map(([id, review]) => [
      id,
      review.createdAt,
    ]),
  );
  const orderedSequences = orderSequencesByReviewRecency(
    sequences,
    reviewedAtBySequenceId,
  );
  const orderedSequenceIds = orderedSequences.map((s) => s.id);

  return (
    <Card id="ai-campaign-review" className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle>Score a campaign&apos;s writing with AI</CardTitle>
        <CardDescription>
          Reads every email in one campaign and scores the <strong>writing</strong>{" "}
          out of 100, with a short critique of what to tighten before it goes out.
          It is advice only: it changes no email, approves nothing, and does not
          affect whether a campaign can be launched. Each review is added to this
          client&apos;s AI spend.
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
            AI features are currently switched off, so nothing can be reviewed.
          </p>
        ) : !aiConfigured ? (
          <p className="text-sm text-muted-foreground">
            The AI is not configured on this environment yet, so nothing can be
            reviewed. Ask an administrator to add the API key.
          </p>
        ) : sequences.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            There are no campaigns to review yet. Create a sequence above first.
          </p>
        ) : (
          <ul className="space-y-4">
            {orderedSequences.map((sequence) => {
              const review = reviewsBySequenceId.get(sequence.id) ?? null;
              return (
                <li key={sequence.id} className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{sequence.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {sequence.stepCount} email
                        {sequence.stepCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    {sequence.stepCount === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No emails yet — nothing to review.
                      </p>
                    ) : !canMutate ? (
                      <p className="text-sm text-muted-foreground">
                        You do not have permission to review this campaign.
                      </p>
                    ) : (
                      <form action={reviewClientCampaignWithAiAction}>
                        <input type="hidden" name="clientId" value={clientId} />
                        <input
                          type="hidden"
                          name="sequenceId"
                          value={sequence.id}
                        />
                        <FormSubmitButton
                          variant="secondary"
                          pendingLabel="Reading the campaign…"
                        >
                          {review ? "Review again" : "Review with AI"}
                        </FormSubmitButton>
                      </form>
                    )}
                  </div>
                  {review ? (
                    <ReviewBody
                      review={review}
                      currentStepCount={sequence.stepCount}
                      defaultOpen={isMostRecentlyReviewed(
                        sequence.id,
                        orderedSequenceIds,
                        reviewedAtBySequenceId,
                      )}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
