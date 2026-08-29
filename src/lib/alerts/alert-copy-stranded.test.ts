import { describe, expect, it } from "vitest";

import { buildAlertEmail, type JobRunSummary, type StrandedMailboxAlert } from "./alert-copy";

/** Every watched job healthy, so the stranded section is the only thing speaking. */
const HEALTHY_JOBS: JobRunSummary[] = [
  {
    name: "process-outbound-queue",
    label: "sending",
    conclusion: "success",
    runs: 12,
    expectedRuns: 1,
  },
  { name: "sync-replies", label: "reply sync", conclusion: "success", runs: 4, expectedRuns: 1 },
];

const FAILED_JOBS: JobRunSummary[] = [
  {
    name: "process-outbound-queue",
    label: "sending",
    conclusion: "failure",
    runs: 3,
    expectedRuns: 1,
  },
];

function checked(
  overrides: Partial<Extract<StrandedMailboxAlert, { checked: true }>> = {},
): StrandedMailboxAlert {
  return {
    checked: true,
    strandedCount: 0,
    newlyStrandedCount: 0,
    liveCount: 55,
    sendableCount: 55,
    strandedByClient: [],
    ...overrides,
  };
}

const SIX_STRANDED = checked({
  strandedCount: 6,
  newlyStrandedCount: 0,
  liveCount: 55,
  sendableCount: 27,
  strandedByClient: [
    {
      clientName: "Protech Roofing",
      entries: [
        { maskedEmail: "in***@protech.example", label: "67 days — was working" },
        { maskedEmail: "he***@protech.example", label: "67 days — never connected" },
      ],
    },
  ],
});

describe("the daily digest — nothing stranded", () => {
  it("still says the check ran, so a vanished section cannot be mistaken for a quiet week", () => {
    const email = buildAlertEmail({
      jobs: HEALTHY_JOBS,
      emailsSent: 0,
      strandedMailboxes: checked(),
    });
    expect(email.severity).toBe("OK");
    expect(email.body).toContain("Mailboxes off the air: none");
  });

  it("reports the headline even when it is all good news", () => {
    const email = buildAlertEmail({
      jobs: HEALTHY_JOBS,
      emailsSent: 0,
      strandedMailboxes: checked(),
    });
    expect(email.body).toContain("55 of 55");
  });
});

describe("the daily digest — mailboxes stranded", () => {
  it("is PARTIAL, exactly as an expired Google login already is", () => {
    const email = buildAlertEmail({
      jobs: HEALTHY_JOBS,
      emailsSent: 0,
      strandedMailboxes: SIX_STRANDED,
    });
    expect(email.severity).toBe("PARTIAL");
  });

  it("puts the count in the subject, because the subject alone must say whether to act", () => {
    const email = buildAlertEmail({
      jobs: HEALTHY_JOBS,
      emailsSent: 0,
      strandedMailboxes: SIX_STRANDED,
    });
    expect(email.subject).toContain("6 mailboxes");
    expect(email.subject).toContain("PARTIAL");
  });

  it("names the client to telephone and how long each has been off the air", () => {
    const email = buildAlertEmail({
      jobs: HEALTHY_JOBS,
      emailsSent: 0,
      strandedMailboxes: SIX_STRANDED,
    });
    expect(email.body).toContain("Protech Roofing");
    expect(email.body).toContain("67 days");
    expect(email.body).toContain("27 of 55");
  });

  // "Newly off the air" is a claim about what the digest NOTICED, not about the
  // moment the mailbox died. The only timestamp available is the row's last
  // change; wording it as "stopped sending last night" would assert more than
  // the data can support.
  it("says a NEW one differently — somebody was at that screen last night", () => {
    const email = buildAlertEmail({
      jobs: HEALTHY_JOBS,
      emailsSent: 0,
      strandedMailboxes: checked({
        strandedCount: 7,
        newlyStrandedCount: 1,
        sendableCount: 26,
        strandedByClient: [
          {
            clientName: "Chevron Security",
            entries: [{ maskedEmail: "sa***@chevron.example", label: "today — was working" }],
          },
        ],
      }),
    });
    expect(email.severity).toBe("PARTIAL");
    expect(email.subject).toContain("newly off the air");
  });

  it("never outranks a job that is actually broken — act now beats act today", () => {
    const email = buildAlertEmail({
      jobs: FAILED_JOBS,
      emailsSent: 0,
      strandedMailboxes: SIX_STRANDED,
    });
    expect(email.severity).toBe("FAILED");
    // Still reported in the body: a mailbox off the air does not stop being true
    // because something else is worse.
    expect(email.body).toContain("Protech Roofing");
  });
});

describe("the daily digest — the stranded check could not run", () => {
  it("reports a blind check loudly, never as a clean bill of health", () => {
    const email = buildAlertEmail({
      jobs: HEALTHY_JOBS,
      emailsSent: 0,
      strandedMailboxes: { checked: false, reason: "the mailbox database could not be read" },
    });
    expect(email.severity).toBe("FAILED");
    expect(email.body).toContain("COULD NOT CHECK");
  });
});

describe("the daily digest — a caller that does not run this check", () => {
  it("renders no stranded section at all when the field is omitted", () => {
    const email = buildAlertEmail({ jobs: HEALTHY_JOBS, emailsSent: 0 });
    expect(email.severity).toBe("OK");
    expect(email.body).not.toContain("Mailboxes off the air");
  });
});
