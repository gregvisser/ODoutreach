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
  name?: string;
  conclusion?: string | null;
  status?: string | null;
  created_at?: string;
};

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

function concludeFrom(runs: GhRun[]): JobConclusion {
  const finished = runs.filter((r) => r.status === "completed");
  if (finished.length === 0) return "success";
  // Any failure in the window is a failure to report. A job that failed at 09:00
  // and recovered at 09:05 still failed, and Greg should know it is flapping.
  return finished.some((r) => r.conclusion !== "success") ? "failure" : "success";
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
    try {
      runs = await runsSince(repo, token, watched.file, since);
      conclusion = concludeFrom(runs);
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
