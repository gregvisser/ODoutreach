import { describe, expect, it } from "vitest";

import {
  evaluateSequenceLaunchReadiness,
  type SequenceLaunchReadinessSnapshotInput,
} from "./launch-readiness";

function snapshot(
  overrides: Partial<SequenceLaunchReadinessSnapshotInput> = {},
): SequenceLaunchReadinessSnapshotInput {
  return {
    sequence: {
      id: "seq1",
      clientId: "c1",
      status: "APPROVED",
      hasAlreadyLaunched: false,
    },
    contactList: {
      id: "list1",
      memberCount: 10,
      emailSendableCount: 7,
    },
    steps: [
      {
        category: "INTRODUCTION",
        template: {
          id: "t-intro",
          status: "APPROVED",
          subject: "Hi {{first_name}}",
          content:
            "Hi {{first_name}} at {{company_name}}\n{{sender_name}}\n{{unsubscribe_link}}",
        },
      },
      {
        category: "FOLLOW_UP_1",
        template: {
          id: "t-fu1",
          status: "APPROVED",
          subject: "Following up",
          content:
            "Just following up {{first_name}}\n{{sender_name}}\n{{unsubscribe_link}}",
        },
      },
    ],
    enrollment: {
      total: 5,
      counts: { PENDING: 5, PAUSED: 0, COMPLETED: 0, EXCLUDED: 0 },
      newlyEnrollableEmailSendable: 2,
    },
    mailbox: {
      connectedSendingCount: 3,
      aggregateRemainingToday: 90,
    },
    outboundUnsubscribeReady: true,
    ...overrides,
  };
}

describe("evaluateSequenceLaunchReadiness — happy path", () => {
  it("passes every check when everything is wired", () => {
    const r = evaluateSequenceLaunchReadiness(snapshot());
    expect(r.canLaunch).toBe(true);
    expect(r.totalBlockers).toBe(0);
    for (const check of r.checks) {
      expect(check.status).toBe("pass");
    }
  });
});

describe("evaluateSequenceLaunchReadiness — blockers", () => {
  it("blocks when sequence is missing", () => {
    const r = evaluateSequenceLaunchReadiness(
      snapshot({ sequence: null }),
    );
    expect(r.canLaunch).toBe(false);
    expect(r.totalBlockers).toBeGreaterThan(0);
    expect(r.checks[0]?.id).toBe("sequence_exists");
    expect(r.checks[0]?.status).toBe("fail");
  });

  it("blocks when sequence is archived", () => {
    const r = evaluateSequenceLaunchReadiness(
      snapshot({
        sequence: {
          id: "seq1",
          clientId: "c1",
          status: "ARCHIVED",
          hasAlreadyLaunched: false,
        },
      }),
    );
    const activeCheck = r.checks.find((c) => c.id === "sequence_approved");
    expect(activeCheck?.status).toBe("fail");
    expect(r.canLaunch).toBe(false);
  });

  it("DRAFT sequence is allowed for launch checks (not a blocker)", () => {
    const r = evaluateSequenceLaunchReadiness(
      snapshot({
        sequence: {
          id: "seq1",
          clientId: "c1",
          status: "DRAFT",
          hasAlreadyLaunched: false,
        },
      }),
    );
    const activeCheck = r.checks.find((c) => c.id === "sequence_approved");
    expect(activeCheck?.status).toBe("pass");
  });

  it("blocks when intro template is archived", () => {
    const s = snapshot();
    s.steps[0]!.template.status = "ARCHIVED";
    const r = evaluateSequenceLaunchReadiness(s);
    const check = r.checks.find(
      (c) => c.id === "introduction_template_approved",
    );
    expect(check?.status).toBe("fail");
    expect(r.canLaunch).toBe(false);
  });

  it("blocks when intro is missing {{unsubscribe_link}} and no public URL", () => {
    const s = snapshot({ outboundUnsubscribeReady: false });
    s.steps[0]!.template.content = "Hi with no token";
    s.steps[0]!.template.subject = "Hi";
    const r = evaluateSequenceLaunchReadiness(s);
    const check = r.checks.find(
      (c) => c.id === "unsubscribe_placeholder_present",
    );
    expect(check?.status).toBe("fail");
    expect(r.canLaunch).toBe(false);
  });

  it("blocks when there is no contact list", () => {
    const r = evaluateSequenceLaunchReadiness(
      snapshot({ contactList: null }),
    );
    expect(r.checks.find((c) => c.id === "contact_list_attached")?.status).toBe(
      "fail",
    );
    expect(r.canLaunch).toBe(false);
  });

  it("blocks when no enrollments AND nothing enrollable", () => {
    const r = evaluateSequenceLaunchReadiness(
      snapshot({
        enrollment: {
          total: 0,
          counts: { PENDING: 0, PAUSED: 0, COMPLETED: 0, EXCLUDED: 0 },
          newlyEnrollableEmailSendable: 0,
        },
      }),
    );
    expect(
      r.checks.find((c) => c.id === "enrollment_records_exist")?.status,
    ).toBe("fail");
    expect(
      r.checks.find((c) => c.id === "pending_email_sendable_recipients")
        ?.status,
    ).toBe("fail");
    expect(r.canLaunch).toBe(false);
  });

  it("blocks when no connected sending mailbox", () => {
    const r = evaluateSequenceLaunchReadiness(
      snapshot({
        mailbox: { connectedSendingCount: 0, aggregateRemainingToday: 0 },
      }),
    );
    const mboxCheck = r.checks.find((c) => c.id === "connected_sending_mailbox");
    expect(mboxCheck?.status).toBe("fail");
    expect(r.canLaunch).toBe(false);
  });

  it("blocks when pool capacity is zero", () => {
    const r = evaluateSequenceLaunchReadiness(
      snapshot({
        mailbox: { connectedSendingCount: 3, aggregateRemainingToday: 0 },
      }),
    );
    expect(
      r.checks.find((c) => c.id === "daily_capacity_available")?.status,
    ).toBe("fail");
    expect(r.canLaunch).toBe(false);
  });

  it("blocks when sequence has already launched", () => {
    const r = evaluateSequenceLaunchReadiness(
      snapshot({
        sequence: {
          id: "seq1",
          clientId: "c1",
          status: "APPROVED",
          hasAlreadyLaunched: true,
        },
      }),
    );
    expect(r.checks.find((c) => c.id === "sequence_not_launched")?.status).toBe(
      "fail",
    );
    expect(r.canLaunch).toBe(false);
  });

  it("treats enrollments-only with 0 PENDING and no new enrollable as blocker", () => {
    const r = evaluateSequenceLaunchReadiness(
      snapshot({
        enrollment: {
          total: 2,
          counts: { PENDING: 0, PAUSED: 2, COMPLETED: 0, EXCLUDED: 0 },
          newlyEnrollableEmailSendable: 0,
        },
      }),
    );
    expect(
      r.checks.find((c) => c.id === "pending_email_sendable_recipients")
        ?.status,
    ).toBe("fail");
    expect(r.canLaunch).toBe(false);
  });

  it("PR F2: blocks launch when the list has ONLY valid-no-email members", () => {
    // List has 4 members, 0 email-sendable, 4 missing email.
    // No PENDING enrollments, no new enrollable.
    const r = evaluateSequenceLaunchReadiness(
      snapshot({
        contactList: {
          id: "list-noemail",
          memberCount: 4,
          emailSendableCount: 0,
          missingEmailCount: 4,
        },
        enrollment: {
          total: 0,
          counts: { PENDING: 0, PAUSED: 0, COMPLETED: 0, EXCLUDED: 0 },
          newlyEnrollableEmailSendable: 0,
        },
      }),
    );
    expect(r.canLaunch).toBe(false);
    const pendingCheck = r.checks.find(
      (c) => c.id === "pending_email_sendable_recipients",
    );
    expect(pendingCheck?.status).toBe("fail");
    expect(pendingCheck?.detail).toContain("4 with no email on file");
    const enrollCheck = r.checks.find(
      (c) => c.id === "enrollment_records_exist",
    );
    expect(enrollCheck?.status).toBe("fail");
    const listCheck = r.checks.find((c) => c.id === "contact_list_attached");
    expect(listCheck?.status).toBe("pass");
    expect(listCheck?.detail).toContain("4 with no email on file");
  });

  it("PR F2: missingEmailCount is informational — a healthy list with both email-sendable AND no-email members still passes", () => {
    const r = evaluateSequenceLaunchReadiness(
      snapshot({
        contactList: {
          id: "list-mixed",
          memberCount: 10,
          emailSendableCount: 7,
          missingEmailCount: 3,
        },
      }),
    );
    expect(r.canLaunch).toBe(true);
    const listCheck = r.checks.find((c) => c.id === "contact_list_attached");
    expect(listCheck?.detail).toContain("3 with no email on file");
  });
});
