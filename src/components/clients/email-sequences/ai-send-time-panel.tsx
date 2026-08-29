import { adviseClientSendTimesWithAiAction } from "@/app/(app)/clients/[clientId]/outreach/ai-send-time-actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { hourLabel, SEND_TIME_ADVICE_PROMPT_VERSION } from "@/lib/ai/send-time-advice";
import {
  AUTOMATIC_SENDER_UTC_HOURS,
  weekdayLabel,
  windowReachability,
  type WindowReachability,
} from "@/lib/ai/send-time-evidence";
import type { StoredSendTimeAdvice } from "@/server/ai/advise-send-times";

/**
 * "Best times to send" — the advice, and the two honest caveats around it.
 *
 * THE COPY IN THIS FILE IS A SAFETY CONTROL, not decoration, and there are two
 * distinct ways this panel could mislead. Both are handled here rather than
 * hoped away.
 *
 * 1. AN OPERATOR BELIEVING SOMETHING WAS RESCHEDULED.
 *    Nothing in this application decides when mail leaves — a GitHub Actions
 *    cron does. So a screen that showed "Best time: Monday 09:00" with no
 *    further comment would read as a setting that had been applied. It says, in
 *    the description and again under the windows, that nothing has changed and a
 *    person has to act on it.
 *
 * 2. A RECOMMENDATION THE SENDER CANNOT REACH.
 *    The cron fires on UTC hours while the advice is in UK local time, so the
 *    reachable band shifts by an hour when the clocks change. A recommended
 *    07:00 is fine in winter and impossible in summer, and a recommended
 *    Saturday is never reachable at all. Every window is labelled with which,
 *    computed rather than assumed — see `windowReachability`.
 */

const REACHABILITY_NOTE: Record<WindowReachability, string | null> = {
  always: null,
  summer_only: "Only reachable while the clocks are forward (late March to late October) — in winter the automatic sender has stopped for the day by then.",
  winter_only: "Only reachable while the clocks are back (late October to late March) — in summer the automatic sender has not started yet at this hour.",
  never: "The automatic sender never runs at this time, so this cannot be acted on without changing the sending schedule.",
};

function formatWhen(value: Date): string {
  // Sliced from the ISO string rather than localised, to avoid a server/client
  // timezone hydration mismatch — the pattern this codebase already uses.
  return value.toISOString().slice(0, 16).replace("T", " ");
}

/**
 * The automatic sender's real hours, in UK local time, both ways round.
 *
 * Printed so an operator can check a partly-covered window themselves rather
 * than trusting a one-word label for the whole of it.
 */
function senderHoursSentence(): string {
  const { first, last } = AUTOMATIC_SENDER_UTC_HOURS;
  return `The automatic sender runs Monday to Friday, ${hourLabel(first + 1)}–${hourLabel(last + 1)} UK while the clocks are forward and ${hourLabel(first)}–${hourLabel(last)} UK while they are back.`;
}

function AdviceBody({ advice }: { advice: StoredSendTimeAdvice }) {
  const oldPrompt = advice.promptVersion !== SEND_TIME_ADVICE_PROMPT_VERSION;

  return (
    <div className="space-y-3 rounded-md border border-border/70 p-3">
      <p className="text-xs text-muted-foreground">
        Worked out {formatWhen(advice.createdAt)} from {advice.totalSent} emails
        and {advice.totalReplied} replies over the last {advice.lookbackDays} days.
      </p>
      {oldPrompt ? (
        <p className="text-xs text-muted-foreground">
          Written by an earlier version of this analysis, so it is not directly
          comparable with newer advice.
        </p>
      ) : null}

      <p className="text-sm">{advice.summary}</p>

      {advice.windows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No time of day stood out for this client. That is a real answer — send
          when it suits the team.
        </p>
      ) : (
        <ul className="space-y-2">
          {advice.windows.map((window, index) => {
            const reach = windowReachability(
              window.weekday,
              window.startHour,
              window.endHour,
            );
            const note = REACHABILITY_NOTE[reach];
            return (
              <li
                key={`${String(window.weekday)}-${String(window.startHour)}-${String(index)}`}
                className="rounded border border-border/60 p-2 text-sm"
              >
                <p className="font-medium">
                  {weekdayLabel(window.weekday)} {hourLabel(window.startHour)}–
                  {hourLabel(window.endHour)} UK
                </p>
                <p className="mt-1 text-muted-foreground">{window.reason}</p>
                {note ? (
                  <p
                    className={
                      reach === "never"
                        ? "mt-1 text-xs font-medium text-destructive"
                        : "mt-1 text-xs font-medium text-amber-700 dark:text-amber-500"
                    }
                  >
                    {note}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {advice.cautions.length > 0 ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            What this does not prove
          </p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {advice.cautions.map((caution, index) => (
              <li key={`caution-${String(index)}`}>{caution}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {advice.evidence.length > 0 ? (
        <details>
          <summary className="cursor-pointer text-sm font-medium">
            The numbers this came from
          </summary>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-1 pr-3 font-medium">When (UK)</th>
                <th className="py-1 pr-3 font-medium">Sent</th>
                <th className="py-1 pr-3 font-medium">Replies</th>
                <th className="py-1 font-medium">Reply rate</th>
              </tr>
            </thead>
            <tbody>
              {advice.evidence.map((slot, index) => (
                <tr
                  key={`slot-${String(slot.weekday)}-${String(slot.hour)}-${String(index)}`}
                  className="border-t border-border/50"
                >
                  <td className="py-1 pr-3">
                    {weekdayLabel(slot.weekday)} {hourLabel(slot.hour)}
                  </td>
                  <td className="py-1 pr-3 tabular-nums">{slot.sent}</td>
                  <td className="py-1 pr-3 tabular-nums">{slot.replied}</td>
                  <td className="py-1 tabular-nums">{slot.replyRatePercent}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Nothing has been rescheduled. This is advice for a person to act on.{" "}
        {senderHoursSentence()}
      </p>
    </div>
  );
}

export function AiSendTimePanel({
  clientId,
  canMutate,
  aiEnabled,
  aiConfigured,
  advice,
  flash,
}: {
  clientId: string;
  canMutate: boolean;
  aiEnabled: boolean;
  aiConfigured: boolean;
  advice: StoredSendTimeAdvice | null;
  flash: { ok: string | null; error: string | null };
}) {
  return (
    <Card id="ai-send-times" className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle>Work out our best send times with AI</CardTitle>
        <CardDescription>
          Counts this client&apos;s own sends and replies by day and hour, then
          asks the AI to read the table and say which times are worth using. It{" "}
          <strong>reschedules nothing</strong> — when mail actually goes out is
          set by the sending schedule, not here. If there is not enough history
          to tell one time from another, it says so and costs nothing. Each run
          is added to this client&apos;s AI spend.
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
          <form action={adviseClientSendTimesWithAiAction}>
            <input type="hidden" name="clientId" value={clientId} />
            <FormSubmitButton
              variant="secondary"
              pendingLabel="Reading the sending history…"
            >
              {advice ? "Work them out again" : "Work out our best send times"}
            </FormSubmitButton>
          </form>
        )}

        {advice ? <AdviceBody advice={advice} /> : null}
      </CardContent>
    </Card>
  );
}
