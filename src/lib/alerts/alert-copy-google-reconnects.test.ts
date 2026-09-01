import { describe, expect, it } from "vitest";

import { buildAlertEmail, type JobRunSummary } from "./alert-copy";

/** Every watched job healthy, so the Google section is the only thing speaking. */
const HEALTHY_JOBS: JobRunSummary[] = [
  { name: "process-outbound-queue", label: "sending", conclusion: "success", runs: 12, expectedRuns: 1 },
  { name: "sync-replies", label: "reply sync", conclusion: "success", runs: 4, expectedRuns: 1 },
];

const FAILED_JOBS: JobRunSummary[] = [
  { name: "process-outbound-queue", label: "sending", conclusion: "failure", runs: 3, expectedRuns: 1 },
];

function checked(overrides: Partial<{
  dueSoonCount: number;
  overdueCount: number;
  totalGoogleMailboxes: number;
  dueSoonByClient: {
    clientId: string;
    clientName: string;
    entries: { email: string; label: string }[];
  }[];
}> = {}) {
  return {
    checked: true as const,
    dueSoonCount: 0,
    overdueCount: 0,
    totalGoogleMailboxes: 5,
    dueSoonByClient: [],
    ...overrides,
  };
}

describe("the daily digest — Google reconnects, nothing due", () => {
  it("still says the check ran, so a silent section cannot be mistaken for silence", () => {
    const email = buildAlertEmail({
      jobs: HEALTHY_JOBS,
      emailsSent: 0,
      googleReconnects: checked(),
    });
    expect(email.severity).toBe("OK");
    expect(email.body).toContain("Google logins: all 5 in date");
  });

  it("leaves the subject alone when there is nothing to reconnect", () => {
    const email = buildAlertEmail({
      jobs: HEALTHY_JOBS,
      emailsSent: 0,
      googleReconnects: checked(),
    });
    expect(email.subject).toContain("ODoutreach OK");
  });
});

describe("the daily digest — Google reconnects due", () => {
  const dueInput = checked({
    dueSoonCount: 3,
    overdueCount: 0,
    totalGoogleMailboxes: 8,
    dueSoonByClient: [
      {
        clientId: "client_trainhugger",
        clientName: "Train Hugger",
        entries: [
          { email: "a@trainhugger.com", label: "Google — reconnect by 4 Sep 2026, 2 days left" },
          { email: "b@trainhugger.com", label: "Google — reconnect by 4 Sep 2026, 2 days left" },
        ],
      },
      {
        clientId: "client_opensdoors",
        clientName: "OpensDoors",
        entries: [
          { email: "c@opensdoors.co.uk", label: "Google — reconnect by 5 Sep 2026, 1 day left" },
        ],
      },
    ],
  });

  it("raises the digest to act-today when logins are due", () => {
    const email = buildAlertEmail({ jobs: HEALTHY_JOBS, emailsSent: 0, googleReconnects: dueInput });
    expect(email.severity).toBe("PARTIAL");
  });

  it("says how many in the subject, because that is all Greg reads on a phone", () => {
    const email = buildAlertEmail({ jobs: HEALTHY_JOBS, emailsSent: 0, googleReconnects: dueInput });
    expect(email.subject).toBe("ODoutreach PARTIAL — 3 Google logins due to be reconnected");
  });

  it("names the client and every mailbox due, which is the whole point of the alert", () => {
    const email = buildAlertEmail({ jobs: HEALTHY_JOBS, emailsSent: 0, googleReconnects: dueInput });
    expect(email.body).toContain("Train Hugger");
    expect(email.body).toContain("a@trainhugger.com");
    expect(email.body).toContain("b@trainhugger.com");
    expect(email.body).toContain("OpensDoors");
    expect(email.body).toContain("c@opensdoors.co.uk");
  });

  it("leads with expired mailboxes, because those have already stopped sending", () => {
    const email = buildAlertEmail({
      jobs: HEALTHY_JOBS,
      emailsSent: 0,
      googleReconnects: checked({ dueSoonCount: 4, overdueCount: 2, dueSoonByClient: [] }),
    });
    expect(email.subject).toBe("ODoutreach PARTIAL — 2 Google mailboxes expired, not sending");
  });

  it("uses the singular for one mailbox", () => {
    const email = buildAlertEmail({
      jobs: HEALTHY_JOBS,
      emailsSent: 0,
      googleReconnects: checked({ dueSoonCount: 1, overdueCount: 0 }),
    });
    expect(email.subject).toBe("ODoutreach PARTIAL — 1 Google login due to be reconnected");
  });

  it("row 155: gives every broken-mailbox line a link to that client's Mailboxes tab, not just the client name", () => {
    const email = buildAlertEmail({
      jobs: HEALTHY_JOBS,
      emailsSent: 0,
      googleReconnects: dueInput,
      appBaseUrl: "https://opensdoors.bidlow.co.uk",
    });
    const lines = email.body.split("\n");
    const trainHuggerA = lines.find((line) => line.includes("a@trainhugger.com"));
    const trainHuggerB = lines.find((line) => line.includes("b@trainhugger.com"));
    const opensDoors = lines.find((line) => line.includes("c@opensdoors.co.uk"));
    expect(trainHuggerA).toContain(
      "https://opensdoors.bidlow.co.uk/clients/client_trainhugger/mailboxes",
    );
    expect(trainHuggerB).toContain(
      "https://opensdoors.bidlow.co.uk/clients/client_trainhugger/mailboxes",
    );
    expect(opensDoors).toContain(
      "https://opensdoors.bidlow.co.uk/clients/client_opensdoors/mailboxes",
    );
  });

  it("row 155: still links each line when no appBaseUrl is supplied, using the shared default", () => {
    const email = buildAlertEmail({ jobs: HEALTHY_JOBS, emailsSent: 0, googleReconnects: dueInput });
    const line = email.body.split("\n").find((l) => l.includes("a@trainhugger.com"));
    expect(line).toMatch(/https?:\/\/\S+\/clients\/client_trainhugger\/mailboxes/);
  });

  it("does not hide a broken job behind a reconnect notice", () => {
    const email = buildAlertEmail({ jobs: FAILED_JOBS, emailsSent: 0, googleReconnects: dueInput });
    expect(email.severity).toBe("FAILED");
    expect(email.subject).toContain("sending failed");
    // ...but the reconnect work is still in the body, not dropped.
    expect(email.body).toContain("a@trainhugger.com");
  });
});

describe("the daily digest — when the Google check could not run", () => {
  it("reports being blind as a failure rather than omitting the section", () => {
    const email = buildAlertEmail({
      jobs: HEALTHY_JOBS,
      emailsSent: 0,
      googleReconnects: { checked: false, reason: "PRODUCTION_DATABASE_URL is not set" },
    });
    expect(email.severity).toBe("FAILED");
    expect(email.subject).toBe("ODoutreach FAILED — Google login check did not run");
    expect(email.body).toContain("PRODUCTION_DATABASE_URL is not set");
  });

  it("still ranks a genuinely broken job above a blind check", () => {
    const email = buildAlertEmail({
      jobs: FAILED_JOBS,
      emailsSent: 0,
      googleReconnects: { checked: false, reason: "connection refused" },
    });
    expect(email.subject).toContain("sending failed");
    expect(email.body).toContain("connection refused");
  });
});

describe("the daily digest — backwards compatibility", () => {
  it("omits the Google section entirely when no input is supplied", () => {
    const email = buildAlertEmail({ jobs: HEALTHY_JOBS, emailsSent: 0 });
    expect(email.severity).toBe("OK");
    expect(email.body).not.toContain("Google logins");
  });
});
