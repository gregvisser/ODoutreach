/**
 * The alert email. Runs in GitHub Actions, deliberately OUTSIDE the app.
 *
 *   npm run ops:alert -- --dry-run   # compose and print, send nothing
 *   npm run ops:alert                # compose and send
 *
 * ## Why it does not run inside ODoutreach
 *
 * An alert route that runs inside the thing that breaks is not a route. If the
 * app is down, the app cannot email. So this lives in Actions, reads the run
 * history from GitHub's own API, and treats an unreachable app as a FAILURE to
 * report rather than a reason it cannot report.
 *
 * ## Configuration, and what happens without it
 *
 * `RESEND_API_KEY`, `ALERT_TO_EMAIL`, `ALERT_FROM_EMAIL`. Missing any of them is
 * a hard, loud exit — **never a quiet skip**. A silent no-op here would be worse
 * than no alerting at all, because silence is the signal that something is
 * wrong, and a skipped send produces exactly the same silence as a dead system.
 */
import { buildAlertEmail, type JobConclusion, type JobRunSummary } from "@/lib/alerts/alert-copy";

const DRY_RUN = process.argv.includes("--dry-run");

/**
 * The scheduled jobs that matter, and whether each is expected on a weekday.
 *
 * `expectedPerDay` is a FLAG, not a target: any positive value means "this
 * should have run today", and the only failure it can produce is "it did not
 * run at all". Measured 2026-08-25, GitHub cron drifts 57-85% on this
 * repository, so comparing counts against a nominal schedule would report a
 * broken cron every morning.
 *
 * The weekly audit and the support agent are 0 because they are not daily —
 * their absence on a given day says nothing.
 */
const WATCHED: { file: string; label: string; expectedPerDay: number }[] = [
  { file: "process-outbound-queue.yml", label: "sending", expectedPerDay: 1 },
  { file: "sync-replies.yml", label: "reply sync", expectedPerDay: 1 },
  { file: "signature-link-audit.yml", label: "signature audit", expectedPerDay: 0 },
  { file: "support-agent.yml", label: "support agent", expectedPerDay: 0 },
];

type GhRun = {
  id?: number;
  name?: string;
  conclusion?: string | null;
  status?: string | null;
  created_at?: string;
};

/**
 * The marker a workflow uses to say "I ran, and part of me failed".
 *
 * GitHub only reports a run as success or failure. It has no idea a batch was
 * partial — but PARTIAL and FAILED are different emails and different actions,
 * act today versus act now. So the workflows fail a partial in a step whose
 * NAME carries this word, and this reads it back.
 *
 * Without it the PARTIAL subject line is unreachable in production, which is
 * exactly what it was until this was checked rather than assumed.
 */
const PARTIAL_STEP_MARKER = "PARTIAL";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(
      `REFUSING TO RUN: ${name} is not set. An alerting job that skips quietly ` +
        `produces the same silence as a dead system, which is the one thing ` +
        `this must never do.`,
    );
    process.exit(1);
  }
  return value;
}

async function runsSince(
  repo: string,
  token: string,
  file: string,
  sinceIso: string,
): Promise<GhRun[]> {
  const url =
    `https://api.github.com/repos/${repo}/actions/workflows/${file}/runs` +
    `?created=%3E${encodeURIComponent(sinceIso)}&per_page=100`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    // A workflow that has never run 404s. That is information, not an error.
    if (res.status === 404) return [];
    throw new Error(`GitHub API ${res.status} for ${file}`);
  }
  const json = (await res.json()) as { workflow_runs?: GhRun[] };
  return json.workflow_runs ?? [];
}

type PartialDetail = { failedCount?: number; totalCount?: number; reasons: string[] };

/**
 * Pull the numbers out of a run's check annotations.
 *
 * The jobs API gives step names but not their output, so the workflow emits an
 * `::error title=PARTIAL::` line, which becomes an annotation the REST API
 * exposes. Without this the subject could only say "failed for 0 items", which
 * is a PARTIAL alert that tells Greg nothing — and the brief's whole point is
 * that the subject alone must say whether to act.
 */
async function partialDetail(
  repo: string,
  token: string,
  jobId: number,
): Promise<PartialDetail> {
  const detail: PartialDetail = { reasons: [] };
  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/check-runs/${jobId}/annotations?per_page=50`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!res.ok) return detail;
    const annotations = (await res.json()) as { title?: string; message?: string }[];
    for (const a of annotations) {
      if (a.title !== "PARTIAL" || !a.message) continue;
      detail.reasons.push(a.message);
      // "reply sync partial: 9 of 35 mailboxes failed"
      const pair = a.message.match(/(\d+)\s+of\s+(\d+)/);
      if (pair) {
        detail.failedCount = Number(pair[1]);
        detail.totalCount = Number(pair[2]);
        continue;
      }
      const single = a.message.match(/(\d+)\s+item/);
      if (single) detail.failedCount = Number(single[1]);
    }
  } catch {
    /* annotations are a nicety — never fail the alert for want of them */
  }
  return detail;
}

/** Did this failed run fail because a batch was partial, or because it broke? */
async function failedBecausePartial(
  repo: string,
  token: string,
  runId: number,
): Promise<{ partial: boolean; jobId?: number }> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/actions/runs/${runId}/jobs?per_page=50`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!res.ok) return { partial: false };
    const json = (await res.json()) as {
      jobs?: { id?: number; steps?: { name?: string; conclusion?: string | null }[] }[];
    };
    for (const job of json.jobs ?? []) {
      for (const step of job.steps ?? []) {
        if (step.conclusion === "failure" && (step.name ?? "").includes(PARTIAL_STEP_MARKER)) {
          return { partial: true, jobId: job.id };
        }
      }
    }
    return { partial: false };
  } catch {
    // Cannot tell — report the harsher of the two. Under-reporting a failure is
    // the mistake that started all this.
    return { partial: false };
  }
}

async function concludeFrom(
  repo: string,
  token: string,
  runs: GhRun[],
): Promise<{ conclusion: JobConclusion; detail?: PartialDetail }> {
  const finished = runs.filter((r) => r.status === "completed");
  if (finished.length === 0) return { conclusion: "success" };
  // Any failure in the window is a failure to report. A job that failed at 09:00
  // and recovered at 09:05 still failed, and Greg should know it is flapping.
  const bad = finished.filter((r) => r.conclusion !== "success");
  if (bad.length === 0) return { conclusion: "success" };

  // If EVERY failure was a partial batch, this is PARTIAL — act today. If any
  // of them was an outright break, it is FAILED — act now.
  let detail: PartialDetail | undefined;
  for (const run of bad) {
    if (typeof run.id !== "number") return { conclusion: "failure" };
    const verdict = await failedBecausePartial(repo, token, run.id);
    if (!verdict.partial) return { conclusion: "failure" };
    if (!detail && typeof verdict.jobId === "number") {
      detail = await partialDetail(repo, token, verdict.jobId);
    }
  }
  return { conclusion: "partial", detail };
}

async function appIsReachable(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/health`, {
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { ok?: boolean };
    return json.ok === true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const repo = process.env.GITHUB_REPOSITORY?.trim() || "gregvisser/ODoutreach";
  const token = required("GITHUB_TOKEN");
  const appUrl = process.env.ALERT_APP_URL?.trim() || "https://opensdoors.bidlow.co.uk";

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const isWeekend = [0, 6].includes(new Date().getUTCDay());

  const jobs: JobRunSummary[] = [];
  for (const watched of WATCHED) {
    let runs: GhRun[] = [];
    let conclusion: JobConclusion = "success";
    let detail: PartialDetail | undefined;
    try {
      runs = await runsSince(repo, token, watched.file, since);
      const verdict = await concludeFrom(repo, token, runs);
      conclusion = verdict.conclusion;
      detail = verdict.detail;
    } catch (error) {
      // Cannot read the run history — report it rather than assume health.
      conclusion = "failure";
      console.error(`Could not read runs for ${watched.file}:`, error);
    }
    jobs.push({
      name: watched.file.replace(/\.yml$/, ""),
      label: watched.label,
      conclusion,
      runs: runs.length,
      // Nothing is scheduled at the weekend, so nothing is missing.
      expectedRuns: isWeekend ? 0 : watched.expectedPerDay,
      failedCount: detail?.failedCount,
      totalCount: detail?.totalCount,
      reasons: detail?.reasons,
    });
  }

  // An unreachable app is the loudest thing this can report.
  if (!(await appIsReachable(appUrl))) {
    jobs.unshift({
      name: "ODoutreach itself",
      label: "the app",
      conclusion: "failure",
      runs: 0,
      expectedRuns: 1,
    });
  }

  const email = buildAlertEmail({ jobs, emailsSent: 0 });

  console.log(`subject: ${email.subject}`);
  console.log(email.body);

  if (DRY_RUN) {
    console.log("\nDRY RUN — nothing sent.");
    return;
  }

  const apiKey = required("RESEND_API_KEY");
  const to = required("ALERT_TO_EMAIL");
  const from = required("ALERT_FROM_EMAIL");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject: email.subject, text: email.body }),
    signal: AbortSignal.timeout(30_000),
  });

  const detail = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok) {
    console.error(`Resend refused the alert: ${res.status} ${detail.message ?? ""}`);
    process.exit(1);
  }
  console.log(`Sent. Resend id ${detail.id ?? "(none)"}.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
