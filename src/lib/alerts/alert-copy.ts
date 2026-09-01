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
        clientId: string;
        clientName: string;
        entries: { email: string; label: string }[];
      }[];
    }
  | { checked: false; reason: string };

/**
 * Live mailboxes that cannot send, as the digest sees it.
 *
 * SEPARATE FROM THE GOOGLE CHECK ON PURPOSE. That check queries
 * `provider: "GOOGLE"`, so it is blind by construction to a Microsoft mailbox
 * that is off the air — and on 29 August 2026 six of the eight stranded
 * mailboxes were Microsoft, including OpensDoors' own, dark for 56 days, while
 * the digest was free to report "Google logins: all in date, nothing to
 * reconnect". Folding this into the Google section would hide exactly the rows
 * the Google section cannot see.
 *
 * `checked: false` is a shape the caller is FORCED to express rather than one it
 * can omit, for the same reason as `GoogleReconnectAlert`: a check that quietly
 * stopped running looks precisely like an estate with nothing wrong.
 */
export type StrandedMailboxAlert =
  | {
      checked: true;
      /** Live mailboxes sitting in PENDING_CONNECTION with no credential. */
      strandedCount: number;
      /** Of those, the ones that appeared inside this digest's window. */
      newlyStrandedCount: number;
      /** Live means active, on a workspace that has not been removed. */
      liveCount: number;
      /** How many of the live can actually send — the probe's headline. */
      sendableCount: number;
      /** Grouped by client, most recent first — a client is who gets telephoned. */
      strandedByClient: {
        clientId: string;
        clientName: string;
        entries: { maskedEmail: string; label: string }[];
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

/**
 * Where the app lives, for links inside the digest.
 *
 * Row 155: before this, a broken-mailbox line read `"${entry.email} —
 * ${entry.label}"` with nothing to click — even Greg, the digest's one
 * recipient, had to already know the URL. Exported so `scripts/ops-alert.ts`
 * can use the same value it falls back to for `ALERT_APP_URL`, rather than
 * two literals drifting apart.
 */
export const DEFAULT_ALERT_APP_BASE_URL = "https://opensdoors.bidlow.co.uk";

/** A direct link to the one screen that fixes this: that client's Mailboxes tab. */
function mailboxesTabLink(appBaseUrl: string, clientId: string): string {
  return `${appBaseUrl.replace(/\/+$/, "")}/clients/${clientId}/mailboxes`;
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
  /**
   * Omitted entirely by callers that do not run the stranded-mailbox check.
   * Omitted means "not my job"; `{ checked: false }` means "it is my job and I
   * failed" — the same distinction the Google field draws.
   */
  strandedMailboxes?: StrandedMailboxAlert;
  /** Where the app lives, for the link on every broken-mailbox line (row 155). */
  appBaseUrl?: string;
}): AlertEmail {
  const window = input.window ?? "the last 24 hours";
  const appBaseUrl = input.appBaseUrl ?? DEFAULT_ALERT_APP_BASE_URL;
  const jobs = input.jobs;
  const google = input.googleReconnects;
  const googleBlind = google !== undefined && google.checked === false;
  const googleDue = google?.checked === true && google.dueSoonCount > 0;
  const stranded = input.strandedMailboxes;
  const strandedBlind = stranded !== undefined && stranded.checked === false;
  const strandedFound = stranded?.checked === true && stranded.strandedCount > 0;

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
  } else if (strandedBlind && stranded?.checked === false) {
    // Same reasoning as the Google blind check, and ranked just below it only
    // because when both are blind they almost always share one cause (no
    // database), and one of them has to own the subject line.
    severity = "FAILED";
    subject = truncate("ODoutreach FAILED — mailbox check did not run", MAX_SUBJECT);
    leadLine =
      "Act now. The check for mailboxes that cannot send could not run, so " +
      "nobody would know if the estate went dark.";
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
  } else if (strandedFound && stranded?.checked === true) {
    // Ranked ABOVE the Google notice, by that notice's own reasoning: a login
    // due in two days has not cost anything yet, and a mailbox that is off the
    // air already has. Ranked BELOW a partial batch, which is the same
    // already-cost-something class but happened in the last 24 hours.
    //
    // PARTIAL, not OK, even when every one of them has been stranded for two
    // months. An expired Google login that stops a mailbox sending is already
    // PARTIAL here, and the same fact must not read as healthier because the
    // mailbox happens to be Microsoft.
    severity = "PARTIAL";
    subject = truncate(
      stranded.newlyStrandedCount > 0
        ? `ODoutreach PARTIAL — ${stranded.newlyStrandedCount} ${
            stranded.newlyStrandedCount === 1 ? "mailbox" : "mailboxes"
          } newly off the air, ${stranded.strandedCount} in total`
        : `ODoutreach PARTIAL — ${stranded.strandedCount} ${
            stranded.strandedCount === 1 ? "mailbox" : "mailboxes"
          } cannot send, ${stranded.sendableCount} of ${stranded.liveCount} can`,
      MAX_SUBJECT,
    );
    leadLine =
      stranded.newlyStrandedCount > 0
        ? "Act today. A mailbox has gone off the air since yesterday — somebody " +
          "was at that screen, so it is the one still worth chasing."
        : "Act today. Mailboxes are off the air and only their owners can sign " +
          "them back in.";
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
        const link = mailboxesTabLink(appBaseUrl, group.clientId);
        for (const entry of group.entries) {
          lines.push(`        ${entry.email} — ${entry.label} — ${link}`);
        }
      }
    }
  }

  // Mailboxes that cannot send at all. Rendered whenever the caller ran the
  // check — INCLUDING when the answer is none, so that a section which silently
  // stopped appearing shows up as a change rather than as a clean estate.
  //
  // A Google mailbox stranded by an abandoned Connect legitimately appears in
  // both this section and the one above: it is both "cannot send now" and "part
  // of the weekly reconnect chore". They are different questions, and
  // suppressing the overlap would mean one section deciding what the other is
  // allowed to report.
  if (stranded) {
    lines.push("");
    if (!stranded.checked) {
      lines.push(
        `  Mailboxes off the air: COULD NOT CHECK — ${stranded.reason}`,
        "      Nobody would know if the estate had stopped being able to send.",
      );
    } else if (stranded.strandedCount === 0) {
      lines.push(
        `  Mailboxes off the air: none — all ${stranded.sendableCount} of ` +
          `${stranded.liveCount} live mailboxes can send.`,
      );
    } else {
      lines.push(
        `  Mailboxes off the air: ${stranded.strandedCount} cannot send ` +
          `(${stranded.sendableCount} of ${stranded.liveCount} live mailboxes can).`,
      );
      for (const group of stranded.strandedByClient) {
        lines.push(`      ${group.clientName}`);
        const link = mailboxesTabLink(appBaseUrl, group.clientId);
        for (const entry of group.entries) {
          lines.push(`        ${entry.maskedEmail} — ${entry.label} — ${link}`);
        }
      }
      lines.push(
        "      Each needs its own owner to sign in at Microsoft or Google.",
        "      Nobody at OpensDoors and no automation can do it for them.",
      );
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
