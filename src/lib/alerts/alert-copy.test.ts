import { describe, expect, it } from "vitest";

import { buildAlertEmail, type JobRunSummary } from "./alert-copy";

/**
 * The subject line carries the message.
 *
 * Greg reads these on a phone, and he is the only recipient. The subject alone
 * has to say whether to act — if he has to open the email to find out, the
 * design has failed.
 *
 * The three shapes the brief specified, verbatim:
 *
 *   ODoutreach OK — 4/4 jobs, 240 sent
 *   ODoutreach PARTIAL — reply sync failed for 8 of 35 mailboxes
 *   ODoutreach FAILED — sending did not run
 */

const job = (over: Partial<JobRunSummary> = {}): JobRunSummary => ({
  name: "Process outbound queue",
  label: "sending",
  conclusion: "success",
  runs: 12,
  expectedRuns: 12,
  ...over,
});

const OK_JOBS: JobRunSummary[] = [
  job(),
  job({ name: "Sync replies", label: "reply sync" }),
  job({ name: "Signature link audit (production)", label: "signature audit", runs: 1, expectedRuns: 1 }),
  job({ name: "Support agent", label: "support agent", runs: 1, expectedRuns: 1 }),
];

describe("the OK digest — sent every day, including when nothing is wrong", () => {
  it("says so in the subject, with the counts", () => {
    const email = buildAlertEmail({ jobs: OK_JOBS, emailsSent: 240 });
    expect(email.subject).toBe("ODoutreach OK — 4/4 jobs, 240 sent");
    expect(email.severity).toBe("OK");
  });

  it("tells him there is nothing to do", () => {
    const email = buildAlertEmail({ jobs: OK_JOBS, emailsSent: 240 });
    expect(email.body).toContain("Nothing to do");
  });

  it("still sends when nothing was sent at all", () => {
    // A quiet day is not an incident, but silence must never be the report —
    // silence is reserved for meaning the alerting itself is broken.
    const email = buildAlertEmail({ jobs: OK_JOBS, emailsSent: 0 });
    expect(email.severity).toBe("OK");
    expect(email.subject).toContain("0 sent");
  });
});

describe("PARTIAL — it ran, but part of it failed", () => {
  it("names the job and the proportion, in the subject", () => {
    const email = buildAlertEmail({
      jobs: [
        job(),
        job({
          name: "Sync replies",
          label: "reply sync",
          conclusion: "partial",
          failedCount: 8,
          totalCount: 35,
        }),
      ],
      emailsSent: 240,
    });
    expect(email.subject).toBe("ODoutreach PARTIAL — reply sync failed for 8 of 35 mailboxes");
    expect(email.severity).toBe("PARTIAL");
  });

  it("says act today", () => {
    const email = buildAlertEmail({
      jobs: [job({ label: "reply sync", conclusion: "partial", failedCount: 8, totalCount: 35 })],
      emailsSent: 0,
    });
    expect(email.body).toContain("today");
  });

  it("names the partial job that can actually say something", () => {
    // Seen live, 2026-08-25: two jobs were partial, and taking the first match
    // produced "ODoutreach PARTIAL — sending failed for 0 items" while the body
    // said "reply sync: 9 of 35 failed". The subject must carry the message.
    const email = buildAlertEmail({
      jobs: [
        job({ label: "sending", conclusion: "partial" }),
        job({
          name: "Sync replies",
          label: "reply sync",
          conclusion: "partial",
          failedCount: 9,
          totalCount: 35,
        }),
      ],
      emailsSent: 0,
    });
    expect(email.subject).toBe("ODoutreach PARTIAL — reply sync failed for 9 of 35 mailboxes");
  });

  it("falls back to a count when the total is unknown", () => {
    const email = buildAlertEmail({
      jobs: [job({ label: "reply sync", conclusion: "partial", failedCount: 3 })],
      emailsSent: 0,
    });
    expect(email.subject).toBe("ODoutreach PARTIAL — reply sync failed for 3 items");
  });
});

describe("FAILED — it did not run, or it died", () => {
  it("names what did not run", () => {
    const email = buildAlertEmail({
      jobs: [job({ label: "sending", conclusion: "failure" }), job({ label: "reply sync" })],
      emailsSent: 0,
    });
    // "ran and failed" and "never ran" are different problems, and the subject
    // says which. This job ran and failed.
    expect(email.subject).toBe("ODoutreach FAILED — sending failed");
    expect(email.severity).toBe("FAILED");
  });

  it("says act now", () => {
    const email = buildAlertEmail({
      jobs: [job({ label: "sending", conclusion: "failure" })],
      emailsSent: 0,
    });
    expect(email.body).toContain("now");
  });

  it("treats a job that did not run AT ALL as a broken schedule", () => {
    /**
     * The brief asked for "missed twice in a row". That is not measurable here,
     * and the numbers are why. Measured on this repository, 2026-08-25, over the
     * previous 24 hours:
     *
     *   every 5 minutes, 07:00-18:00 weekdays  -> 132 scheduled,  20 actually ran
     *   every 15 minutes, same window          ->  44 scheduled,  19 actually ran
     *
     * GitHub cron drifts 57-85%. A run that never fires leaves no record, so
     * "in a row" has nothing to count, and any threshold near the nominal
     * schedule would report a broken cron every single morning — the exact
     * noise the brief warns kills alerting.
     */
    const drifting = buildAlertEmail({
      jobs: [job({ label: "sending", runs: 20, expectedRuns: 132 })],
      emailsSent: 240,
    });
    expect(drifting.severity).toBe("OK");

    const silent = buildAlertEmail({
      jobs: [job({ label: "sending", runs: 0, expectedRuns: 132 })],
      emailsSent: 0,
    });
    expect(silent.severity).toBe("FAILED");
    expect(silent.subject).toBe("ODoutreach FAILED — sending did not run");
  });

  it("does not call a weekend a broken schedule", () => {
    // Nothing is scheduled at the weekend, so nothing is missing.
    const weekend = buildAlertEmail({
      jobs: [job({ label: "sending", runs: 0, expectedRuns: 0 })],
      emailsSent: 0,
    });
    expect(weekend.severity).toBe("OK");
  });

  it("outranks a partial when both happened", () => {
    const email = buildAlertEmail({
      jobs: [
        job({ label: "reply sync", conclusion: "partial", failedCount: 8, totalCount: 35 }),
        job({ label: "sending", conclusion: "failure" }),
      ],
      emailsSent: 0,
    });
    // Act now beats act today.
    expect(email.severity).toBe("FAILED");
  });
});

describe("the body earns its place", () => {
  it("lists every job with its outcome, so one email is the whole picture", () => {
    const email = buildAlertEmail({ jobs: OK_JOBS, emailsSent: 240 });
    for (const j of OK_JOBS) expect(email.body).toContain(j.name);
  });

  it("carries the reasons when there are any", () => {
    const email = buildAlertEmail({
      jobs: [
        job({
          label: "reply sync",
          conclusion: "partial",
          failedCount: 2,
          totalCount: 35,
          reasons: ["mailbox jo@x.co.uk: token expired", "mailbox sam@y.com: 401"],
        }),
      ],
      emailsSent: 0,
    });
    expect(email.body).toContain("token expired");
  });

  it("never sends a subject long enough to be cut off on a phone", () => {
    const email = buildAlertEmail({
      jobs: [
        job({
          name: "A job with a very long name indeed",
          label: "a label that goes on and on and on and on and on",
          conclusion: "partial",
          failedCount: 8,
          totalCount: 35,
        }),
      ],
      emailsSent: 240,
    });
    expect(email.subject.length).toBeLessThanOrEqual(78);
  });

  it("says who it is from and why, so it is never mistaken for outreach", () => {
    const email = buildAlertEmail({ jobs: OK_JOBS, emailsSent: 240 });
    expect(email.body).toMatch(/ODoutreach/);
  });
});

describe("a partial with no count never claims zero", () => {
  /**
   * Seen live on 2026-08-25:
   *
   *   process-outbound-queue: PARTIAL — 0 failed (21 runs)
   *
   * which is a sentence contradicting itself. It does not mean nothing failed.
   * It means the job reported a problem and attached no number to it — that
   * run was in fact reporting the SAME eight failing mailboxes, via a
   * pre-advance reply sync whose message carried no count the parser could
   * read.
   *
   * "0 failed" is the most dangerous thing this could print: it is the
   * reassuring reading of a line that exists because something went wrong.
   */
  it("says part of it failed, rather than 0 failed, in the body", () => {
    const email = buildAlertEmail({
      jobs: [job({ name: "Process outbound queue", label: "sending", conclusion: "partial" })],
      emailsSent: 0,
    });
    expect(email.body).not.toContain("0 failed");
    expect(email.body).toContain("part of it failed");
  });

  it("says the same in the subject when nothing else can be said", () => {
    const email = buildAlertEmail({
      jobs: [job({ label: "sending", conclusion: "partial" })],
      emailsSent: 0,
    });
    expect(email.subject).not.toContain("0 items");
    expect(email.subject).toBe("ODoutreach PARTIAL — sending partly failed");
  });

  it("still prefers a job that HAS a number", () => {
    const email = buildAlertEmail({
      jobs: [
        job({ label: "sending", conclusion: "partial" }),
        job({ name: "Sync replies", label: "reply sync", conclusion: "partial", failedCount: 8, totalCount: 35 }),
      ],
      emailsSent: 0,
    });
    expect(email.subject).toBe("ODoutreach PARTIAL — reply sync failed for 8 of 35 mailboxes");
    expect(email.body).toContain("part of it failed");
    expect(email.body).toContain("8 of 35 failed");
  });

  it("a genuine zero is still reported as a zero", () => {
    // failedCount: 0 EXPLICITLY set is different from absent. Keep them apart.
    const email = buildAlertEmail({
      jobs: [job({ label: "sending", conclusion: "partial", failedCount: 0, totalCount: 40 })],
      emailsSent: 0,
    });
    expect(email.subject).toContain("0 of 40");
  });
});

