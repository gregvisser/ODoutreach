/**
 * What the alert email says.
 *
 * Greg is the only recipient, and he reads these on a phone. **The subject alone
 * must say whether to act.** If he has to open it to find out, this has failed.
 *
 *   ODoutreach OK      — nothing to do
 *   ODoutreach PARTIAL — act today
 *   ODoutreach FAILED  — act now
 *
 * ## Why the OK one exists at all
 *
 * An alert route that runs inside the thing that breaks is not a route. So the
 * digest sends **every day, including when everything is fine**, and silence
 * becomes the signal: nothing by 09:00 means either the system or the alerting
 * is broken, and Greg cannot tell which — which is exactly the point.
 *
 * ## Why one recipient
 *
 * Greg's decision, made explicitly. It means nothing is noticed while he is
 * away. Stated once here and not built around: no fallback recipient, no
 * escalation, no distribution list.
 */

export type JobConclusion = "success" | "partial" | "failure";

export type JobRunSummary = {
  /** The workflow name, as GitHub reports it. */
  name: string;
  /** What it does, in Greg's words — "sending", "reply sync". Used in subjects. */
  label: string;
  conclusion: JobConclusion;
  /** How many times it ran in the window. */
  runs: number;
  /**
   * Whether this job is scheduled at all in this window. Any positive number
   * means "it should have run"; the value is not compared against `runs`,
   * because GitHub cron drift makes that comparison meaningless.
   */
  expectedRuns: number;
  failedCount?: number;
  totalCount?: number;
  reasons?: string[];
};

export type AlertSeverity = "OK" | "PARTIAL" | "FAILED";

export type AlertEmail = {
  severity: AlertSeverity;
  subject: string;
  body: string;
};

/**
 * A broken schedule means the job DID NOT RUN AT ALL in the window.
 *
 * THE BRIEF ASKED FOR "missed twice in a row", AND THAT IS NOT MEASURABLE HERE.
 * Measured on this repository, 2026-08-25, over the previous 24 hours:
 *
 *   every 5 minutes, 07:00-18:00 weekdays   132 scheduled ->  20 actually ran
 *   every 15 minutes, same window             44 scheduled ->  19 actually ran
 *
 * GitHub's scheduled triggers are best-effort and drift 57-85% under load. A run
 * that simply never fires leaves no record, so "in a row" has nothing to count,
 * and any threshold near the nominal schedule would report a broken cron every
 * single morning. That is precisely the noise the brief warns kills alerting.
 *
 * "It has not run at all today" cannot false-positive on drift, and it is what a
 * person actually means by a broken schedule.
 */
function scheduleLooksBroken(job: JobRunSummary): boolean {
  return job.expectedRuns > 0 && job.runs === 0;
}

/** A phone truncates around 80. Leave room. */
const MAX_SUBJECT = 78;

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

export function buildAlertEmail(input: {
  jobs: readonly JobRunSummary[];
  emailsSent: number;
  /** Window description for the body, e.g. "the last 24 hours". */
  window?: string;
}): AlertEmail {
  const window = input.window ?? "the last 24 hours";
  const jobs = input.jobs;

  // FAILED outranks PARTIAL: act now beats act today.
  const failed = jobs.find((j) => j.conclusion === "failure" || scheduleLooksBroken(j));
  // Of several partial jobs, name the one that can SAY something. Taking the
  // first match produced "sending failed for 0 items" in the subject while the
  // body said "reply sync: 9 of 35 failed" — a subject that carries no message
  // is the one thing this must not do.
  const partial = jobs
    .filter((j) => j.conclusion === "partial")
    .sort((a, b) => (b.failedCount ?? -1) - (a.failedCount ?? -1))[0];

  const total = jobs.length;
  const healthy = jobs.filter(
    (j) => j.conclusion === "success" && !scheduleLooksBroken(j),
  ).length;

  let severity: AlertSeverity;
  let subject: string;
  let leadLine: string;

  if (failed) {
    severity = "FAILED";
    // "did not run" and "ran and failed" are different problems and the subject
    // should not blur them — one means the schedule is broken, the other means
    // the job is.
    const why = failed.conclusion === "failure" ? "failed" : "did not run";
    subject = truncate(`ODoutreach FAILED — ${failed.label} ${why}`, MAX_SUBJECT);
    leadLine =
      failed.conclusion === "failure"
        ? `Act now. ${failed.name} ran and failed in ${window}.`
        : `Act now. ${failed.name} did not run at all in ${window}.`;
  } else if (partial) {
    severity = "PARTIAL";
    const scope =
      typeof partial.totalCount === "number"
        ? `${partial.failedCount ?? 0} of ${partial.totalCount} mailboxes`
        : `${partial.failedCount ?? 0} items`;
    subject = truncate(`ODoutreach PARTIAL — ${partial.label} failed for ${scope}`, MAX_SUBJECT);
    leadLine = `Act today. ${partial.name} ran, but part of it failed.`;
  } else {
    severity = "OK";
    subject = truncate(
      `ODoutreach OK — ${healthy}/${total} jobs, ${input.emailsSent} sent`,
      MAX_SUBJECT,
    );
    leadLine = "Nothing to do.";
  }

  const lines: string[] = [leadLine, "", `ODoutreach — ${window}.`, ""];

  for (const j of jobs) {
    const state =
      j.conclusion === "failure"
        ? "FAILED"
        : j.conclusion === "partial"
          ? `PARTIAL — ${j.failedCount ?? 0}${typeof j.totalCount === "number" ? ` of ${j.totalCount}` : ""} failed`
          : scheduleLooksBroken(j)
            ? "DID NOT RUN — no runs at all in this window"
            : "ok";
    // Just the count. A ratio against the nominal schedule would read as a
    // failure every morning, because GitHub cron drifts 57-85% here.
    lines.push(`  ${j.name}: ${state} (${j.runs} run${j.runs === 1 ? "" : "s"})`);
    for (const reason of (j.reasons ?? []).slice(0, 10)) {
      lines.push(`      ${reason}`);
    }
  }

  lines.push("", `Emails sent: ${input.emailsSent}`);
  lines.push(
    "",
    "This email is sent every day, including when everything is fine.",
    "If it does not arrive by 09:00, either the system or the alerting is broken.",
  );

  return { severity, subject, body: lines.join("\n") };
}
