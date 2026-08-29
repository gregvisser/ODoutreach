import { adviseClientTitleMessagesWithAiAction } from "@/app/(app)/clients/[clientId]/outreach/ai-title-message-actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { TITLE_MESSAGE_PROMPT_VERSION } from "@/lib/ai/title-message";
import {
  MIN_CELL_ENROLLMENTS,
  TITLE_MESSAGE_MATURITY_DAYS,
  type TitleFamilyStat,
  type TitleMessageComparison,
} from "@/lib/ai/title-message-evidence";
import type { StoredTitleMessageReview } from "@/server/ai/advise-title-messages";

/**
 * "Which campaign suits which job title" — the numbers, and the caveats that
 * stop them being read as more than they are.
 *
 * THE COPY IN THIS FILE IS A SAFETY CONTROL, not decoration. A table of
 * campaigns sorted by reply rate under a job title is read as an instruction to
 * rewrite copy, whatever the heading says, and there are three distinct ways it
 * could mislead. All three are handled here rather than hoped away.
 *
 * 1. A READER SEEING A DIFFERENCE THAT IS NOT THERE.
 *    Cold-outreach reply rates are low single digits, so two identical
 *    campaigns routinely land points apart — and this screen makes DOZENS of
 *    comparisons at once, so at the ordinary threshold it would produce a false
 *    winner nearly every time. Every row therefore carries the verdict of an
 *    actual significance test whose bar was raised for the number of
 *    comparisons, and "within normal variation" is printed on the row rather
 *    than left to be inferred from a percentage.
 *
 * 2. A READER THINKING THIS IS ABOUT THE WRITING.
 *    Nobody was randomised. Each campaign was aimed at a list somebody built by
 *    hand, so a campaign that wins with an audience may simply have been given a
 *    better list of that audience. The panel says this above the table, because
 *    by the time somebody has read the numbers they have already formed the
 *    conclusion.
 *
 * 3. A READER THINKING THIS COVERS EVERYONE.
 *    A large share of imported job titles cannot be grouped, and the recent
 *    weeks are excluded because those people are still being emailed. The
 *    coverage line is shown WITH the numbers rather than in a footnote.
 */

const COMPARISON_LABEL: Record<TitleMessageComparison["kind"], string> = {
  above: "More replies from this audience — larger than chance",
  below: "Fewer replies from this audience — larger than chance",
  indistinguishable: "Within normal variation",
};

function comparisonClass(kind: TitleMessageComparison["kind"]): string {
  if (kind === "above") return "text-emerald-700 dark:text-emerald-500";
  if (kind === "below") return "text-amber-700 dark:text-amber-500";
  return "text-muted-foreground";
}

function formatWhen(value: Date): string {
  // Sliced from the ISO string rather than localised, to avoid a server/client
  // timezone hydration mismatch — the pattern this codebase already uses.
  return value.toISOString().slice(0, 16).replace("T", " ");
}

function FamilyTable({ family }: { family: TitleFamilyStat }) {
  return (
    <div className="mt-3">
      <p className="text-sm font-medium">
        {family.label}{" "}
        <span className="font-normal text-muted-foreground">
          — {family.enrollments} people, {family.replied} replied (
          {family.replyRatePercent}%)
        </span>
      </p>
      <table className="mt-1 w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-1 pr-3 font-medium">Campaign</th>
            <th className="py-1 pr-3 font-medium">People</th>
            <th className="py-1 pr-3 font-medium">Replied</th>
            <th className="py-1 pr-3 font-medium">Positive</th>
            <th className="py-1 font-medium">What that means</th>
          </tr>
        </thead>
        <tbody>
          {family.messages.map((message) => (
            <tr
              key={message.sequenceId}
              className="border-t border-border/50 align-top"
            >
              <td className="py-1.5 pr-3">{message.label}</td>
              <td className="py-1.5 pr-3 tabular-nums">{message.enrollments}</td>
              <td className="py-1.5 pr-3 tabular-nums">
                {message.replied} ({message.replyRatePercent}%)
              </td>
              <td className="py-1.5 pr-3 tabular-nums">
                {message.positive} ({message.positiveRatePercent}%)
              </td>
              <td className="py-1.5">
                <span className={comparisonClass(message.comparison.kind)}>
                  {COMPARISON_LABEL[message.comparison.kind]}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReviewBody({ review }: { review: StoredTitleMessageReview }) {
  const oldPrompt = review.promptVersion !== TITLE_MESSAGE_PROMPT_VERSION;
  const { coverage } = review;

  return (
    <div className="space-y-3 rounded-md border border-border/70 p-3">
      <p className="text-xs text-muted-foreground">
        Analysed {formatWhen(review.createdAt)} from {review.totalReplied}{" "}
        replies ({review.totalPositive} positive) over the last{" "}
        {review.lookbackDays} days.
      </p>
      {oldPrompt ? (
        <p className="text-xs text-muted-foreground">
          Written by an earlier version of this analysis, so it is not directly
          comparable with a newer one.
        </p>
      ) : null}

      {coverage ? (
        <p className="rounded border border-border/60 bg-muted/50 p-2 text-xs text-muted-foreground">
          <strong className="text-foreground">
            This covers {coverage.compared} of {coverage.totalEnrollments} people
            ({coverage.comparedPercent}%).
          </strong>{" "}
          Left out: {coverage.missingTitle} with no job title on record,{" "}
          {coverage.ungrouped} whose title could not be sorted into an audience,
          and {coverage.tooThinToCompare} in audiences too small to compare.
          Anything below is about the {coverage.comparedPercent}%, not about your
          whole list.
        </p>
      ) : null}

      {!review.anyDistinguishable ? (
        <p className="rounded border border-border/60 bg-muted/50 p-2 text-sm">
          <strong>No campaign is measurably ahead with any audience.</strong> The
          percentages below differ, but not by more than normal variation would
          produce across the {review.comparisonCount} comparisons made here.
          Treat these campaigns as performing the same.
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
              <p className="font-medium">
                {finding.audienceLabel} — {finding.messageLabel}
              </p>
              <p className="mt-1 text-muted-foreground">{finding.observation}</p>
              {finding.couldExplainIt.length > 0 ? (
                <>
                  <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Any of these could cause it
                  </p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
                    {finding.couldExplainIt.map((cause, causeIndex) => (
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
          {review.evidence.map((family) => (
            <FamilyTable key={family.family} family={family} />
          ))}
        </details>
      ) : null}

      <p className="text-xs text-muted-foreground">
        One row is one person, not one email — everyone gets the whole campaign,
        and it stops as soon as they reply. Only replies we could match back to a
        specific email are counted, so every campaign here is undercounted a
        little. People enrolled in the last {TITLE_MESSAGE_MATURITY_DAYS} days
        are left out because they are still being emailed, and a campaign needs
        at least {MIN_CELL_ENROLLMENTS} people in an audience to appear at all.
      </p>
    </div>
  );
}

export function TitleMessagePanel({
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
  review: StoredTitleMessageReview | null;
  flash: { ok: string | null; error: string | null };
}) {
  return (
    <Card id="ai-message-fit" className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle>Which campaign suits which job title</CardTitle>
        <CardDescription>
          Sorts the people you have emailed into audiences by job title, counts
          how each campaign did with each one, checks whether the differences are
          bigger than normal variation, then asks the AI to explain only the ones
          that are.{" "}
          <strong>
            This is not proof that one campaign is better written.
          </strong>{" "}
          Nobody was split at random — each campaign went to a list somebody
          built — so a campaign that wins with an audience may simply have been
          given a better list of them. It changes no campaign, template or
          targeting, and it never suggests replacement wording. If there is not
          enough history to tell the campaigns apart, it says so and costs
          nothing. Each run is added to this client&apos;s AI spend.
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
          <form action={adviseClientTitleMessagesWithAiAction}>
            <input type="hidden" name="clientId" value={clientId} />
            <FormSubmitButton
              variant="secondary"
              pendingLabel="Comparing the campaigns…"
            >
              {review ? "Run it again" : "Compare campaigns by job title"}
            </FormSubmitButton>
          </form>
        )}

        {review ? <ReviewBody review={review} /> : null}
      </CardContent>
    </Card>
  );
}
