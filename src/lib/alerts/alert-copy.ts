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

/**
 * The Google seven-day reconnect chore, as the digest sees it.
 *
 * `checked: false` is deliberately a shape this type FORCES the caller to
 * express rather than something it can omit. The Google app stays unpublished,
 * so every Google mailbox expires weekly and the only warning anybody gets is
 * this email; a check that quietly stopped running would look exactly like a
 * week with nothing due. So "I could not look" is reported, loudly, as its own
 * failure — the same reasoning that makes the whole digest send every day.
 */
export type GoogleReconnectAlert =
  | {
      checked: true;
      /** Expired, plus expiring within the warning window. */
      dueSoonCount: number;
      /** Of those, the ones already dead and not sending. */
      overdueCount: number;
      totalGoogleMailboxes: number;
      /** Grouped by client, most urgent first — a client is who gets telephoned. */
      dueSoonByClient: {
        clientName: string;
        entries: { email: string; label: string }[];
      }[];
    }
  | { checked: false; reason: string };

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
  /**
   * Omitted entirely by callers that do not run the Google check. Supplying
   * `{ checked: false }` is NOT the same as omitting it: omitted means "this
   * caller does not do that job", false means "it is my job and I failed".
   */
  googleReconnects?: GoogleReconnectAlert;
}): AlertEmail {
  const window = input.window ?? "the last 24 hours";
  const jobs = input.jobs;
  const google = input.googleReconnects;
  const googleBlind = google !== undefined && google.checked === false;
  const googleDue = google?.checked === true && google.dueSoonCount > 0;

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
  } else if (googleBlind) {
    // Ranked below a broken job (that is a live outage) and above everything
    // else, because a blind check is an alarm that has stopped working, and an
    // alarm nobody knows is off is worse than one that is merely noisy.
    severity = "FAILED";
    subject = truncate("ODoutreach FAILED — Google login check did not run", MAX_SUBJECT);
    leadLine =
      "Act now. The seven-day Google reconnect check could not run, so nobody " +
      "is being warned about expiring mailboxes.";
  } else if (partial) {
    // Kept AHEAD of the Google notice deliberately: both are "act today", but a
    // partial batch means sends failed in the last 24 hours, where a login due
    // in two days has not cost anything yet. The Google detail is in the body
    // either way, so nothing is lost by not owning the subject line.
    severity = "PARTIAL";
    // A job that reported a problem WITHOUT a number must never be rendered as
    // "0 failed" or "failed for 0 items". Seen live on 2026-08-25, where that
    // line was in fact reporting the same eight failing mailboxes as the job
    // beside it. Zero is the reassuring reading of a line that exists because
    // something went wrong, and it is the one reading that is never true.
    subject = truncate(
      typeof partial.failedCount === "number"
        ? `ODoutreach PARTIAL — ${partial.label} failed for ${
            typeof partial.totalCount === "number"
              ? `${partial.failedCount} of ${partial.totalCount} mailboxes`
              : `${partial.failedCount} items`
          }`
        : `ODoutreach PARTIAL — ${partial.label} partly failed`,
      MAX_SUBJECT,
    );
    leadLine = `Act today. ${partial.name} ran, but part of it failed.`;
  } else if (googleDue && google?.checked === true) {
    severity = "PARTIAL";
    subject = truncate(
      google.overdueCount > 0
        ? `ODoutreach PARTIAL — ${google.overdueCount} Google ${
            google.overdueCount === 1 ? "mailbox" : "mailboxes"
          } expired, not sending`
        : `ODoutreach PARTIAL — ${google.dueSoonCount} Google ${
            google.dueSoonCount === 1 ? "login" : "logins"
          } due to be reconnected`,
      MAX_SUBJECT,
    );
    leadLine =
      google.overdueCount > 0
        ? "Act today. Google logins have expired, so those mailboxes have stopped sending."
        : "Act today. Google logins are about to expire and need reconnecting.";
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
          ? typeof j.failedCount === "number"
            ? `PARTIAL — ${j.failedCount}${typeof j.totalCount === "number" ? ` of ${j.totalCount}` : ""} failed`
            : "PARTIAL — part of it failed, with no count reported"
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

  // The Google seven-day reconnect chore. Always rendered when the caller ran
  // the check — including when nothing is due, so that a section which silently
  // stopped appearing is visible as a change rather than as a quiet week.
  if (google) {
    lines.push("");
    if (!google.checked) {
      lines.push(
        `  Google logins: COULD NOT CHECK — ${google.reason}`,
        "      Nobody is being warned about mailboxes whose seven-day login is expiring.",
      );
    } else if (google.dueSoonCount === 0) {
      lines.push(
        `  Google logins: all ${google.totalGoogleMailboxes} in date, nothing to reconnect.`,
      );
    } else {
      lines.push(
        `  Google logins: ${google.dueSoonCount} of ${google.totalGoogleMailboxes} need reconnecting` +
          (google.overdueCount > 0
            ? ` (${google.overdueCount} already expired and not sending)`
            : ""),
      );
      for (const group of google.dueSoonByClient) {
        lines.push(`      ${group.clientName}`);
        for (const entry of group.entries) {
          lines.push(`        ${entry.email} — ${entry.label}`);
        }
      }
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
