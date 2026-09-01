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
import {
  buildAlertEmail,
  DEFAULT_ALERT_APP_BASE_URL,
  type GoogleReconnectAlert,
  type JobConclusion,
  type JobRunSummary,
  type StrandedMailboxAlert,
} from "@/lib/alerts/alert-copy";
import { readPartialAnnotations, type PartialDetail } from "@/lib/alerts/partial-annotations";
import { buildGoogleReconnectRoster } from "@/lib/mailboxes/google-reconnect-roster";
import { buildStrandedMailboxRoster } from "@/lib/mailboxes/stranded-mailbox-roster";

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
  // This workflow does two jobs: it ingests replies AND re-syncs every
  // do-not-contact sheet. The label reads out in the alert subject, and
  // "reply sync partly failed" sent someone to the mailbox screen when what
  // had actually stopped was two clients' blocklists.
  { file: "sync-replies.yml", label: "reply & do-not-contact sync", expectedPerDay: 1 },
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

/**
 * Pull the numbers out of a run's check annotations.
 *
 * The jobs API gives step names but not their output, so the workflow emits an
 * `::error title=PARTIAL::` line, which becomes an annotation the REST API
 * exposes. Without this the subject could only say "failed for 0 items", which
 * is a PARTIAL alert that tells Greg nothing.
 *
 * The PARSING lives in `@/lib/alerts/partial-annotations` and is tested there,
 * against the real annotations this returned live — including the fact that
 * they come back in reverse order, which the first version of this quietly
 * depended on not being true.
 */
async function partialDetail(
  repo: string,
  token: string,
  jobId: number,
): Promise<PartialDetail> {
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
    if (!res.ok) return { reasons: [] };
    const annotations = (await res.json()) as { title?: string; message?: string }[];
    return readPartialAnnotations(annotations);
  } catch {
    /* annotations are a nicety — never fail the alert for want of them */
    return { reasons: [] };
  }
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

/**
 * The seven-day Google reconnect chore, read straight from the production
 * database.
 *
 * This is the ONLY warning anybody gets. The Google OAuth app is deliberately
 * unpublished (the owner's decision, 28 August 2026), so Google expires each
 * mailbox's refresh token seven days after consent and OpensDoors reconnect by
 * hand every week. Before this, the way they found out a mailbox had expired
 * was that outreach stopped.
 *
 * It reads its own rows rather than going through `@/server/queries` because
 * that module is `server-only` and this is a plain Node script. The RULES —
 * which mailbox is due, in what order, and in what words — come from the shared
 * `buildGoogleReconnectRoster`, so this cannot drift from what the screen shows.
 *
 * NEVER THROWS. A failure here must not take the whole digest down: an alert
 * that stops arriving is indistinguishable from a healthy silent night, which
 * is the failure mode this entire file exists to avoid. Every problem comes
 * back as `checked: false`, which the composer renders as a loud FAILED.
 */
async function readGoogleReconnects(now: Date): Promise<GoogleReconnectAlert> {
  if (!process.env.DATABASE_URL?.trim()) {
    return {
      checked: false,
      reason:
        "DATABASE_URL is not set for the alert job, so no mailbox could be checked",
    };
  }
  try {
    // Imported lazily: without a DATABASE_URL the Prisma client throws on
    // construction, and that must be reported as a blind check rather than
    // crash the digest before it is composed.
    const { prisma } = await import("@/lib/db");
    const rows = await prisma.clientMailboxIdentity.findMany({
      where: {
        provider: "GOOGLE",
        isActive: true,
        workspaceRemovedAt: null,
        // The tenant wall as it applies to a job with no session: a
        // soft-deleted workspace is nobody's chore.
        client: { deletedAt: null },
      },
      select: {
        id: true,
        clientId: true,
        email: true,
        provider: true,
        connectionStatus: true,
        connectedAt: true,
        client: { select: { name: true, slug: true } },
      },
    });

    const roster = buildGoogleReconnectRoster(
      rows.map((row) => ({
        mailboxId: row.id,
        clientId: row.clientId,
        clientName: row.client.name,
        clientSlug: row.client.slug,
        provider: row.provider,
        connectionStatus: row.connectionStatus,
        connectedAt: row.connectedAt,
        email: row.email,
      })),
      now,
    );

    return {
      checked: true,
      dueSoonCount: roster.dueSoonCount,
      overdueCount: roster.overdueCount,
      totalGoogleMailboxes: roster.totalGoogleMailboxes,
      dueSoonByClient: roster.dueSoonByClient.map((group) => ({
        clientId: group.clientId,
        clientName: group.clientName,
        entries: group.entries.map((entry) => ({
          email: entry.email,
          label: entry.label,
        })),
      })),
    };
  } catch (error) {
    return {
      checked: false,
      reason: `the mailbox database could not be read (${
        error instanceof Error ? error.message : String(error)
      })`,
    };
  }
}

/**
 * Which live mailboxes cannot send at all, read straight from the production
 * database.
 *
 * DELIBERATELY A SECOND QUERY, not folded into the Google one. Two reasons.
 * The Google read filters `provider: "GOOGLE"` and so cannot see a Microsoft
 * mailbox that is off the air — which was six of the eight on 29 August 2026,
 * OpensDoors' own among them, dark for 56 days while the digest reported the
 * Google chore as clear. And keeping them apart means one check failing leaves
 * the other still able to speak, instead of one fault blinding both.
 *
 * The RULES come from the shared `buildStrandedMailboxRoster`, which applies the
 * same shipped predicates as the Monday production probe, so the daily email and
 * the probe cannot drift into disagreeing about who is off the air.
 *
 * NEVER THROWS — every problem comes back as `checked: false`, which the
 * composer renders as a loud FAILED. An alert that dies while composing is
 * indistinguishable from a healthy silent night.
 */
async function readStrandedMailboxes(now: Date): Promise<StrandedMailboxAlert> {
  if (!process.env.DATABASE_URL?.trim()) {
    return {
      checked: false,
      reason:
        "DATABASE_URL is not set for the alert job, so no mailbox could be checked",
    };
  }
  try {
    const { prisma } = await import("@/lib/db");
    const rows = await prisma.clientMailboxIdentity.findMany({
      where: {
        // The tenant wall as it applies to a job with no session: a soft-deleted
        // workspace is nobody's outage.
        client: { deletedAt: null },
      },
      select: {
        id: true,
        clientId: true,
        email: true,
        provider: true,
        connectionStatus: true,
        isActive: true,
        isSendingEnabled: true,
        workspaceRemovedAt: true,
        updatedAt: true,
        lastSyncAt: true,
        client: { select: { name: true, slug: true } },
        // Presence only. The credential itself is never read here.
        secret: { select: { id: true } },
      },
    });

    const roster = buildStrandedMailboxRoster(
      rows.map((row) => ({
        mailboxId: row.id,
        clientId: row.clientId,
        clientName: row.client.name,
        clientSlug: row.client.slug,
        email: row.email,
        provider: row.provider,
        connectionStatus: row.connectionStatus,
        hasStoredCredential: row.secret !== null,
        isActive: row.isActive,
        workspaceRemovedAt: row.workspaceRemovedAt,
        isSendingEnabled: row.isSendingEnabled,
        pendingSince: row.updatedAt,
        lastSyncAt: row.lastSyncAt,
      })),
      now,
    );

    return {
      checked: true,
      strandedCount: roster.strandedCount,
      newlyStrandedCount: roster.newlyStrandedCount,
      liveCount: roster.liveCount,
      sendableCount: roster.sendableCount,
      strandedByClient: roster.strandedByClient.map((group) => ({
        clientId: group.clientId,
        clientName: group.clientName,
        entries: group.entries.map((entry) => ({
          maskedEmail: entry.maskedEmail,
          label: entry.label,
        })),
      })),
    };
  } catch (error) {
    return {
      checked: false,
      reason: `the mailbox database could not be read (${
        error instanceof Error ? error.message : String(error)
      })`,
    };
  }
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
  const appUrl = process.env.ALERT_APP_URL?.trim() || DEFAULT_ALERT_APP_BASE_URL;

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

  const now = new Date();
  const googleReconnects = await readGoogleReconnects(now);
  const strandedMailboxes = await readStrandedMailboxes(now);

  const email = buildAlertEmail({
    jobs,
    emailsSent: 0,
    googleReconnects,
    strandedMailboxes,
    appBaseUrl: appUrl,
  });

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
