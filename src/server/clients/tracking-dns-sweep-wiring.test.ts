/**
 * The sweep is WIRED — not merely written.
 *
 * QUEUE.md records six instances this week of something built, wired, reporting
 * success and never firing. It is the defect this project is worst at. A
 * scheduled job is the easiest possible place for it to happen again: the code
 * can be perfect, the tests green, and the workflow can reference an npm script
 * that does not exist, or a schedule that never runs, and nothing anywhere
 * fails. The job simply never happens, quietly, for months.
 *
 * So this file asserts the CHAIN, end to end, from the cron line to the exported
 * function. Every link is checked against the real files on disk. If somebody
 * renames the npm script, moves the entry module, or deletes the schedule, this
 * goes red rather than the sweep going silent.
 *
 * What this cannot prove is that GitHub actually runs the schedule — no test
 * can. That is why the send-time freshness gate exists as well: see
 * TRACKING_DNS_MAX_AGE_DAYS, which closes tracking with nothing running at all.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

/*
  The entry module is imported for real below, to prove the names resolve. That
  drags in the persistence half, which constructs a Prisma client and throws on a
  missing DATABASE_URL. Stubbed rather than given a connection string: this file
  is asserting that the WIRING exists, and it must not need a database to say so
  — a test that quietly required Postgres would be skipped in exactly the
  circumstances where the wiring is most likely to have rotted.
*/
vi.mock("@/lib/db", () => ({ prisma: {} }));

const ROOT = process.cwd();
const WORKFLOW = join(ROOT, ".github/workflows/tracking-dns-sweep.yml");
const SCRIPT = join(ROOT, "scripts/ops-tracking-dns-sweep.ts");
const NPM_SCRIPT = "ops:tracking-dns-sweep";

const workflow = readFileSync(WORKFLOW, "utf8");
const script = readFileSync(SCRIPT, "utf8");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};

describe("the tracking-DNS sweep is wired from cron to code", () => {
  it("the workflow is on a schedule, not only manual dispatch", () => {
    // `workflow_dispatch` alone would look wired and never fire on its own.
    expect(workflow).toMatch(/schedule:/);
    expect(workflow).toMatch(/- cron: "[^"]+"/);
  });

  it("the workflow runs the npm script, and that npm script exists", () => {
    expect(workflow).toContain(`npm run ${NPM_SCRIPT}`);
    expect(pkg.scripts[NPM_SCRIPT]).toBeDefined();
  });

  it("the npm script points at a file that is really there", () => {
    const target = pkg.scripts[NPM_SCRIPT];
    expect(target).toContain("scripts/ops-tracking-dns-sweep.ts");
    expect(script.length).toBeGreaterThan(0);
  });

  it("the script imports the sweep and both of its persistence halves", () => {
    // A sweep that loaded clients but never wrote the disable would run green
    // for ever while changing nothing.
    expect(script).toContain("sweepTrackingDnsRegressions");
    expect(script).toContain("loadTrackedClientsForDnsSweep");
    expect(script).toContain("disableTrackingForDnsRegression");
    expect(script).toContain("persistTrackingDnsCheck");
  });

  it("every name the script imports is actually exported by the entry module", async () => {
    // The check that catches a rename. Importing the module for real means a
    // typo'd export is a red test rather than a crash at 05:30 in production.
    const entry = await import("./tracking-dns-sweep-entry");
    for (const name of [
      "sweepTrackingDnsRegressions",
      "loadTrackedClientsForDnsSweep",
      "disableTrackingForDnsRegression",
      "persistTrackingDnsCheck",
      "liveTrackingDnsResolver",
    ]) {
      expect(entry, `${name} is imported by the ops script`).toHaveProperty(name);
    }
  });

  it("REFUSES to report a clean sweep when there is no database", () => {
    // The false-green guard. A job that sweeps an empty database, finds nothing
    // wrong and exits 0 is the exact failure this repo has recorded six times.
    expect(script).toMatch(/DATABASE_URL/);
    expect(script).toMatch(/process\.exit\(1\)/);
    expect(workflow).toMatch(/refusing to report a clean tracking-DNS sweep/i);
  });

  it("runs before the send window opens, not after it", () => {
    // A sweep at 09:00 notices a regression after that morning's outreach has
    // already gone out carrying a pixel on a domain that no longer authenticates.
    const cron = /- cron: "(\d+) (\d+) /.exec(workflow);
    expect(cron).not.toBeNull();
    const hourUtc = Number(cron?.[2]);
    expect(hourUtc).toBeLessThan(7);
  });
});
