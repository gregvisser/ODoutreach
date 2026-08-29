// A cycle's log must REACH GIT. This test fails if the log directory is
// ignored, or if a completed cycle's log was never tracked.
//
// WHY THIS EXISTS
//
// `.gitignore` used to carry `/.bidlow/relay/log/`, in the block for local and
// transient files beside `NEXT.md`, `CURRENT.md` and `STATUS.json`. That was a
// deliberate choice, not an oversight - a cycle log is a transcript, and
// transcripts are noise.
//
// It cost a cycle. On 2026-08-27 cycle 50 found a hard E2E failure as a side
// finding, wrote "I'm queueing it as a new row", and exited without doing so.
// The report existed in exactly one gitignored file. Cycle 52 then spent its
// whole reconnaissance re-deriving it from scratch.
//
// WHAT WAS MEASURED BEFORE THIS CHANGED (cycle 53)
//
//   * Secrets: ZERO across all 55 existing logs. Tracking a file puts it in the
//     object store permanently, so this was the objection that could have
//     blocked the whole idea. The Sentry DSN public key set in
//     deploy-production.yml appears in none of them; the only credential-shaped
//     string is a bare Sentry ingest HOST with no key attached.
//   * Findings lost: FOUR, not one - so the cheap "be more careful" answer was
//     not available.
//   * Volume: 55 files, 360,677 bytes, about 6.5 KB per cycle. Negligible.
//
// WHY A NAMED DIRECTORY AND NOT A GLOB OVER `.bidlow/**`
//
// The same reason `tracked-artefacts.test.ts` gives: a glob would sweep in every
// `QUEUE.md.bak-before-*` scratch file the relay drops, and the fix for a red
// test would become "add another ignore rule" instead of "commit the log".
//
// WHAT THIS TEST DOES **NOT** CLAIM
//
// Tracking a log makes it durable. It does not make anyone read it.
// `cycle-050.md` was never deleted - it is on disk to this day - and cycle 52
// still re-derived it, because the channel every cycle actually reads is
// QUEUE.md. That residual is queue row 40, deliberately left open rather than
// folded in here and quietly called fixed.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "..");
const LOG_DIR_REL = ".bidlow/relay/log";
const LOG_DIR_ABS = path.join(REPO_ROOT, ".bidlow", "relay", "log");

/** Cycle logs, by number, oldest first. */
function cycleLogs(): ReadonlyArray<{ file: string; rel: string; n: number }> {
  if (!existsSync(LOG_DIR_ABS)) return [];
  return readdirSync(LOG_DIR_ABS)
    .map((file) => ({ file, match: /^cycle-(\d+)\.md$/.exec(file) }))
    .filter((e): e is { file: string; match: RegExpExecArray } => e.match !== null)
    .map(({ file, match }) => ({
      file,
      rel: `${LOG_DIR_REL}/${file}`,
      n: Number(match[1]),
    }))
    .sort((a, b) => a.n - b.n);
}

/**
 * How many times we have shelled out to git to answer "is this tracked?".
 * Asserted below; see `trackedLogPaths` for why it must stay at one.
 */
let gitLsFilesCalls = 0;

/**
 * Every path git has in its index under the cycle-log directory, as one set.
 *
 * ONE `git ls-files`, NOT ONE PER FILE, AND THAT IS THE WHOLE POINT.
 *
 * This used to call `git ls-files --error-unmatch <file>` once per log inside a
 * `.filter()`. That is a process spawn per log, and the cost therefore grew by
 * one spawn every time a cycle wrote its log. Measured on 2026-08-29 at 96 logs:
 * 96 spawns took 2,653ms on an IDLE machine against a 5,000ms per-test budget,
 * and the batched call below took 36ms - 73x faster. Under load the per-file
 * version reproduced the exact failure cycle 76 hit, `Test timed out in 5000ms`,
 * at 7,105ms; the batched version answers in tens of milliseconds at the same
 * load.
 *
 * So this was never a flaky test in the usual sense. It was a linear-growth
 * timing bug whose deadline the suite was walking towards at ~28ms per cycle,
 * and raising the timeout would only have bought a few weeks before the same
 * red returned on a slower machine - which is why the queue explicitly refused
 * that fix.
 *
 * Two correctness gains come free with the batching:
 *   * It does NOT swallow a git failure. The old per-file version caught every
 *     error and returned false, so a broken or absent git reported all 96 logs
 *     as untracked - a confusing red pointing at the wrong thing. If git cannot
 *     answer, that now throws and says so.
 *   * `-z` returns NUL-separated literal paths. Without it git quotes and
 *     escapes any path containing non-ASCII or unusual characters, which would
 *     silently never match a plain string compare.
 */
function trackedLogPaths(): ReadonlySet<string> {
  gitLsFilesCalls += 1;
  const out = execFileSync("git", ["ls-files", "-z", "--", LOG_DIR_REL], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  // git reports POSIX separators on every platform, which is what `rel` uses.
  return new Set(out.split("\0").filter((p) => p.length > 0));
}

/** True when some .gitignore rule excludes this path. */
function isIgnoredByGit(relPath: string): boolean {
  try {
    execFileSync("git", ["check-ignore", "--quiet", "--", relPath], {
      cwd: REPO_ROOT,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Credential shapes that must never be committed inside a cycle log.
 *
 * Deliberately shape-based, not name-based. A log is prose about the build, so
 * it names `DATABASE_URL` and `GOOGLE_CLIENT_SECRET` constantly and must be
 * allowed to; what it must never do is carry the VALUE. Every pattern below was
 * run against all 77 existing logs and returned zero, so this gate starts green
 * on real history rather than being switched on over a pile of exceptions.
 */
const CREDENTIAL_PATTERNS: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: "GitHub token", re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/ },
  { name: "GitHub fine-grained PAT", re: /\bgithub_pat_[A-Za-z0-9_]{30,}\b/ },
  { name: "AWS access key id", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: "Anthropic API key", re: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: "OpenAI-style API key", re: /\bsk-[A-Za-z0-9]{32,}\b/ },
  { name: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: "PEM private key", re: /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/ },
  {
    name: "JSON Web Token",
    re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  },
  {
    name: "connection string with an inline password",
    re: /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:/@]+:[^\s@]+@/,
  },
  {
    name: "Sentry DSN including its key",
    re: /https:\/\/[0-9a-f]{16,}@[A-Za-z0-9.-]*ingest[A-Za-z0-9.-]*\//,
  },
  {
    name: "secret environment variable assigned a real value",
    re: /\b(?:AUTH_SECRET|NEXTAUTH_SECRET|DATABASE_URL|PRODUCTION_DATABASE_URL|AZURE_AD_CLIENT_SECRET|MICROSOFT_CLIENT_SECRET|GOOGLE_CLIENT_SECRET|GOOGLE_SERVICE_ACCOUNT_JSON_BASE64|RESEND_API_KEY|CRON_SECRET|OUTBOUND_DEV_SECRET|INBOUND_DEV_SECRET|SENTRY_AUTH_TOKEN)["']?\s*[=:]\s*["']?[A-Za-z0-9_+/=~.-]{16,}/,
  },
];

/** Every `file:line — what it looks like` hit in the given text. */
function credentialHits(
  text: string,
  label: string,
): ReadonlyArray<string> {
  const hits: string[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    for (const { name, re } of CREDENTIAL_PATTERNS) {
      if (re.test(line)) hits.push(`${label}:${i + 1} — ${name}`);
    }
  });
  return hits;
}

describe("cycle logs reach git", () => {
  // The load-bearing assertion, and the one that went red first. It is
  // deterministic: it does not depend on what happens to be on disk, so it
  // cannot cry wolf, and a gate that cries wolf gets ignored - which is how
  // this repository got here in the first place.
  it("does not ignore the cycle-log directory", () => {
    const probe = `${LOG_DIR_REL}/cycle-001.md`;

    expect(
      isIgnoredByGit(probe),
      `${probe} is excluded by a .gitignore rule, so a finding written only to ` +
        `a cycle log cannot survive a rebase or \`git clean -fd\`. That already ` +
        `cost cycle 52 an entire reconnaissance re-deriving cycle 50's finding. ` +
        `Fix by narrowing the ignore rule, not by deleting this test.`,
    ).toBe(false);
  });

  it("has a back catalogue of logs to protect", () => {
    // Without this, every assertion below passes vacuously on a checkout that
    // happens to have no logs in it - the signature defect of this repository:
    // built, wired, reporting success, never firing.
    expect(
      cycleLogs().length,
      "no cycle-NNN.md logs were found at all, so the checks in this file " +
        "would pass without testing anything.",
    ).toBeGreaterThan(10);
  });

  it("is checking against a real git repository", () => {
    const tracked = execFileSync("git", ["ls-files", "--", "relay-watch.ps1"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    }).trim();

    expect(
      tracked,
      "git returned nothing for a file known to be tracked, so the checks " +
        "above would pass vacuously. The test harness itself is broken.",
    ).toBe("relay-watch.ps1");
  });

  it("tracks every cycle log, including the previous cycle's", () => {
    // NO EXEMPTION FOR THE NEWEST LOG, and that is the whole mechanism.
    //
    // The watcher writes cycle N's log AFTER the agent has exited, so nothing
    // inside cycle N can ever commit it. It is cycle N+1 that has to, and this
    // assertion is what makes it happen: `npm test` is a mandatory gate on
    // every cycle, so cycle N+1 opens with a RED test naming cycle N's log and
    // cannot claim done until it has been added to a commit.
    //
    // WHAT THIS FORCES YOU TO COMMIT IS NOT ONLY THE WATCHER'S WRITING, AND
    // ASSUMING OTHERWISE COST A LOG.
    //
    // Until 2026-08-28 the watcher ended the cycle with `... | Set-Content -Path
    // $logFile`, onto the same filename cycles use for their OWN account of
    // themselves. Set-Content truncates, so the agent's log - the 130-230 line
    // document Greg actually reads - was destroyed and replaced by boilerplate,
    // the brief, and the agent's last stdout line. This assertion then did its
    // job on the wreckage: it went red until cycle N+1 committed the stub, so a
    // GREEN test actively pushed the loss into git. `cycle-056.md` on `main` is
    // exactly that, and it was restored by cycle 63 from
    // `feat/privacy-terms-pages`.
    //
    // The truncation is fixed in `relay-watch.ps1` (`Write-CycleLog` appends and
    // never shortens) and held by `relay/cycle-log-preserved.test.ts`. So a
    // cycle log is now TWO halves in one file: the cycle's own words first, the
    // watcher's evidence underneath. If you are here because this test is red,
    // `git add` the file - do NOT regenerate it, and do not replace it with
    // something shorter.
    //
    // That is deliberately not "the agent remembers to mirror it". Cycle 50
    // wrote "I'm queueing it as a new row" and exited without doing so, and
    // cycle 52 did the same with two hand-ups; a rule that leans on the author
    // remembering is precisely what has already failed twice here.
    //
    // Exempting the newest log would have made this test unable to fire at all:
    // during cycle N+1 the newest log IS cycle N's, so the one file that needs
    // forcing would have been the one file excused. That would have been the
    // eleventh "built, wired, reports success, never fired".
    const before = gitLsFilesCalls;
    const tracked = trackedLogPaths();
    const untracked = cycleLogs().filter((l) => !tracked.has(l.rel));

    expect(
      untracked.map((l) => l.file),
      `these cycle logs exist but are NOT tracked by git, so a rebase or ` +
        `\`git clean -fd\` deletes them and any finding recorded only there ` +
        `goes with them. This is the expected state at the START of a cycle: ` +
        `the watcher wrote the previous cycle's log after that agent exited, ` +
        `and committing it is THIS cycle's job. Fix by adding them to your ` +
        `commit (\`git add ${LOG_DIR_REL}\`), not by deleting this test.`,
    ).toEqual([]);

    // The regression guard for the timeout this test was rewritten to fix.
    //
    // It counts SPAWNS, not milliseconds, on purpose. A duration assertion here
    // would be the same class of defect we are removing: it would pass or fail
    // on how busy the machine is, and would go red on a slow CI runner having
    // found nothing wrong. The number of times we shell out to git is a fact
    // about the code, so it is the same answer on every machine, every time.
    expect(
      gitLsFilesCalls - before,
      "this check asked git more than once. It must stay a single batched " +
        "`git ls-files` over the whole log directory: the per-file version " +
        "cost one process spawn per cycle log, grew by one spawn every cycle, " +
        "and timed out at 5,000ms under load (cycle 76, and reproduced at " +
        "7,105ms on 2026-08-29). Do not answer a red here by raising the " +
        "timeout - that only defers it to a slower machine.",
    ).toBe(1);
  });
});

// The precondition of the decision above, turned into a gate instead of a memory.
//
// Queue row 38 allowed cycle logs into git on ONE explicit condition: "scan all
// 53 existing logs for credential-shaped strings before putting any of them in
// git - a gate log can contain a token, and tracking is irreversible in the
// object store." Cycle 53 did exactly that, by hand, over 55 logs, found zero,
// and tracked them.
//
// THEN THE CHECK STOPPED AND THE DECISION KEPT RUNNING. By cycle 79 another 26
// logs had been committed - permanently, into the object store - and not one of
// them had been scanned by anything. The measurement was a one-off; the thing it
// authorised was forever.
//
// That gap is worse than merely unguarded, because of what the test above does.
// `npm test` is a mandatory gate on every cycle, and the assertion above goes RED
// until the previous cycle's log is added to a commit. So the safety mechanism is
// also the delivery mechanism: if a cycle ever pastes a real token into its log
// while narrating a gate failure, the tracking test does not just permit that
// token into git, it FORCES it there, and a push makes it unrecallable.
//
// Hence this block. Same file on purpose - it guards the same decision, and a
// reader who deletes one should be looking straight at the other.
describe("cycle logs carry no credentials", () => {
  it("can actually detect a credential", () => {
    // Without this the suite below passes vacuously the moment a pattern is
    // mistyped, and reports "clean" for a scanner that cannot match anything.
    // That is this repository's most-recorded defect and it is not going to be
    // introduced by the test written to prevent it.
    const planted = [
      "token ghp_abcdefghijklmnopqrstuvwxyz0123",
      "db postgres://admin:hunter2@10.0.0.4:5432/prod",
      "aws AKIAIOSFODNN7EXAMPLE",
      "-----BEGIN RSA PRIVATE KEY-----",
      'DATABASE_URL="postgresBUTnotAurlJUSTalongvalue"',
    ].join("\n");

    const hits = credentialHits(planted, "planted");

    expect(
      hits.length,
      "the credential patterns matched nothing in a sample built entirely out " +
        "of credentials, so the scan below proves nothing.",
    ).toBeGreaterThanOrEqual(5);
  });

  it("finds no credential in any cycle log", () => {
    const logs = cycleLogs();

    expect(
      logs.length,
      "no cycle logs were found, so this scan would report clean without " +
        "reading anything.",
    ).toBeGreaterThan(10);

    const hits = logs.flatMap((log) =>
      credentialHits(readFileSync(path.join(LOG_DIR_ABS, log.file), "utf8"), log.rel),
    );

    expect(
      hits,
      `a cycle log contains something shaped like a live credential. The test ` +
        `above will commit this file on the next cycle, and git never forgets, ` +
        `so REDACT THE VALUE IN THE LOG NOW - before it is pushed. If the ` +
        `credential is real, it must also be ROTATED: removing it from the file ` +
        `is not a fix once it has been committed. Do NOT silence this by adding ` +
        `an ignore rule or an exception list.`,
    ).toEqual([]);
  });
});
