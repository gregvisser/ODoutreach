import { describe, expect, it } from "vitest";

import { buildAlertEmail } from "./alert-copy";
import { readPartialAnnotations } from "./partial-annotations";

/**
 * End-to-end proof that a failing do-not-contact sheet reaches Greg's inbox.
 *
 * ## Why this test exists rather than another "it's wired" assertion
 *
 * This repository's worst recurring defect is something built, wired,
 * reporting success, and never firing. The do-not-contact sheet sync was the
 * seventh instance: it ran every fifteen minutes, the route correctly answered
 * `ok: false` with HTTP 207, and the workflow — which checked only the status,
 * and 207 is a 2xx — ticked green. Production run 33002377746 on 2026-08-26
 * did exactly that while Train Hugger's and Pareto FM's domain blocklists had
 * both stopped updating.
 *
 * Asserting that the YAML contains the right words would be the same mistake
 * one level up. So the strings below are not invented for the test. They are
 * the annotations the fixed step emitted in production, copied verbatim out of
 * the check-runs API for run 33045022987 on 2026-08-27 — the first run of this
 * workflow after the fix went live — via the same endpoint `ops-alert.ts`
 * reads. This test carries them the rest of the way — annotations → parsed
 * detail → composed email — and asserts that a person reading the email learns
 * WHICH clients stopped and WHAT to do.
 *
 * The tab names below are the real ones, and they are the whole diagnosis:
 * both sheets were being read at `Sheet1!A1:Z50000` and neither has a tab
 * called Sheet1. Keep these strings in sync with production rather than
 * tidying them — their value is that nobody made them up.
 */
const ANNOTATIONS_THE_STEP_EMITS = [
  {
    title: "PARTIAL",
    message: "do-not-contact sheet sync: 2 of 34 sheet(s) failed to update",
  },
  {
    title: "PARTIAL",
    message:
      'do-not-contact sheet: Train Hugger — Whole domains: Check the Sheet tab name and range (e.g. Sheet1!A:Z). Update the range if your data is on another tab. We looked in Sheet1!A1:Z50000. This Sheet\'s tabs are: "Domains", "Company Names".',
  },
  {
    title: "PARTIAL",
    message:
      'do-not-contact sheet: Pareto FM — Whole domains: Check the Sheet tab name and range (e.g. Sheet1!A:Z). Update the range if your data is on another tab. We looked in Sheet1!A1:Z50000. This Sheet\'s tabs are: "Domains".',
  },
];

describe("a dead do-not-contact sheet becomes an email that names it", () => {
  const detail = readPartialAnnotations(ANNOTATIONS_THE_STEP_EMITS);

  const email = buildAlertEmail({
    jobs: [
      {
        name: "Sync replies",
        label: "reply & do-not-contact sync",
        conclusion: "partial",
        runs: 12,
        expectedRuns: 1,
        failedCount: detail.failedCount,
        totalCount: detail.totalCount,
        reasons: detail.reasons,
      },
    ],
    emailsSent: 0,
  });

  it("says PARTIAL — act today, not FAILED and not OK", () => {
    expect(email.severity).toBe("PARTIAL");
    expect(email.body).toContain("Act today");
  });

  it("does not put a mailbox count in the subject for a Sheets failure", () => {
    // The step deliberately omits the `partial: N of M` counting shape, because
    // the subject renders any count as "N of M mailboxes". These are Sheets.
    expect(detail.failedCount).toBeUndefined();
    expect(email.subject).not.toContain("mailboxes");
    expect(email.subject).toContain("reply & do-not-contact sync");
  });

  it("names BOTH clients in the body — the whole point of the alert", () => {
    expect(email.body).toContain("Train Hugger");
    expect(email.body).toContain("Pareto FM");
  });

  it("carries the count and the fix instruction through to the body", () => {
    expect(email.body).toContain("2 of 34 sheet(s) failed to update");
    expect(email.body).toContain("Check the Sheet tab name and range");
    // The diagnosis that makes it actionable without opening the Sheet: the
    // range we tried, beside the tabs that actually exist. Read together they
    // say "there is no tab called Sheet1" without anyone opening the Sheet.
    expect(email.body).toContain(
      'This Sheet\'s tabs are: "Domains", "Company Names"',
    );
    expect(email.body).toContain("We looked in Sheet1!A1:Z50000");
  });

  it("stays silent when every sheet synced — the alert must not cry wolf", () => {
    const clean = buildAlertEmail({
      jobs: [
        {
          name: "Sync replies",
          label: "reply & do-not-contact sync",
          conclusion: "success",
          runs: 12,
          expectedRuns: 1,
        },
      ],
      emailsSent: 40,
    });
    expect(clean.severity).toBe("OK");
    expect(clean.body).not.toContain("Train Hugger");
  });
});
