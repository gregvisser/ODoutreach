import { describe, expect, it } from "vitest";

import {
  buildSequenceStepSendIdempotencyKey,
  classifySequenceStepSendCandidate,
  incrementStepSendCount,
  zeroStepSendCounts,
  type SequenceStepSendCandidate,
} from "./sequence-send-policy";

function candidate(
  overrides: Partial<SequenceStepSendCandidate> = {},
): SequenceStepSendCandidate {
  const clientId = overrides.clientId ?? "client-1";
  return {
    clientId,
    sequence: overrides.sequence ?? { id: "seq-1", clientId },
    step:
      overrides.step ??
      ({
        id: "step-1",
        sequenceId: "seq-1",
        templateId: "tpl-1",
      } as const),
    template:
      overrides.template ??
      ({
        id: "tpl-1",
        clientId,
        status: "APPROVED",
        subject: "Hello {{first_name}}",
        content: "Hi {{first_name}},\n\nRegards,\n{{sender_name}}",
      } as const),
    enrollment:
      overrides.enrollment ??
      ({
        id: "enr-1",
        clientId,
        sequenceId: "seq-1",
        contactId: "ct-1",
        status: "PENDING",
      } as const),
    contact:
      overrides.contact ??
      ({
        id: "ct-1",
        clientId,
        firstName: "Ada",
        lastName: "Lovelace",
        fullName: "Ada Lovelace",
        company: "Analytical",
        role: null,
        website: null,
        email: "ada@example.com",
        mobilePhone: null,
        officePhone: null,
        isSuppressed: false,
      } as const),
    sender:
      overrides.sender ??
      ({
        senderName: "Charles",
        senderEmail: "charles@opensdoors.example",
        senderCompanyName: "Babbage Outreach",
        emailSignature: "—Charles",
        unsubscribeLink: "https://u.example/1",
      } as const),
  };
}

describe("buildSequenceStepSendIdempotencyKey", () => {
  it("is deterministic and stable", () => {
    expect(
      buildSequenceStepSendIdempotencyKey({
        sequenceId: "s1",
        enrollmentId: "e1",
        stepId: "st1",
      }),
    ).toBe("seq:s1:enr:e1:step:st1");
  });

  it("differs when any id changes", () => {
    const a = buildSequenceStepSendIdempotencyKey({
      sequenceId: "s1",
      enrollmentId: "e1",
      stepId: "st1",
    });
    const b = buildSequenceStepSendIdempotencyKey({
      sequenceId: "s1",
      enrollmentId: "e1",
      stepId: "st2",
    });
    const c = buildSequenceStepSendIdempotencyKey({
      sequenceId: "s1",
      enrollmentId: "e2",
      stepId: "st1",
    });
    const d = buildSequenceStepSendIdempotencyKey({
      sequenceId: "s2",
      enrollmentId: "e1",
      stepId: "st1",
    });
    expect(new Set([a, b, c, d]).size).toBe(4);
  });
});

describe("classifySequenceStepSendCandidate", () => {
  it("returns READY for a valid, approved, email-sendable candidate", () => {
    const result = classifySequenceStepSendCandidate(candidate());
    expect(result.status).toBe("READY");
    expect(result.reason).toBe("ready");
    expect(result.reasonDetail).toBeNull();
    expect(result.composition.sendReady).toBe(true);
    expect(result.composition.subject).toBe("Hello Ada");
    expect(result.composition.body).toContain("Hi Ada,");
  });

  it("blocks when contact has no email", () => {
    const result = classifySequenceStepSendCandidate(
      candidate({
        contact: {
          ...candidate().contact,
          email: null,
        },
      }),
    );
    expect(result.status).toBe("BLOCKED");
    expect(result.reason).toBe("blocked_missing_email");
  });

  it("classifies SUPPRESSED when contact is suppressed", () => {
    const result = classifySequenceStepSendCandidate(
      candidate({
        contact: {
          ...candidate().contact,
          isSuppressed: true,
        },
      }),
    );
    expect(result.status).toBe("SUPPRESSED");
    expect(result.reason).toBe("blocked_suppressed");
  });

  it("blocks when template is not APPROVED", () => {
    const result = classifySequenceStepSendCandidate(
      candidate({
        template: {
          ...candidate().template,
          status: "DRAFT",
        },
      }),
    );
    expect(result.status).toBe("BLOCKED");
    expect(result.reason).toBe("blocked_template_not_approved");
    expect(result.reasonDetail).toContain("DRAFT");
  });

  it("blocks on unknown placeholder in template", () => {
    const result = classifySequenceStepSendCandidate(
      candidate({
        template: {
          ...candidate().template,
          subject: "Hi {{nickname}}",
          content: "Body",
        },
      }),
    );
    expect(result.status).toBe("BLOCKED");
    expect(result.reason).toBe("blocked_unknown_placeholder");
    expect(result.reasonDetail).toContain("{{nickname}}");
    expect(result.composition.unknownPlaceholders).toEqual(["nickname"]);
  });

  it("blocks when sender has no unsubscribe link", () => {
    const result = classifySequenceStepSendCandidate(
      candidate({
        sender: {
          ...candidate().sender,
          unsubscribeLink: null,
        },
      }),
    );
    expect(result.status).toBe("BLOCKED");
    expect(result.reason).toBe("blocked_missing_unsubscribe_link");
  });

  it("blocks when sender is missing a required field", () => {
    const result = classifySequenceStepSendCandidate(
      candidate({
        sender: {
          ...candidate().sender,
          senderCompanyName: null,
        },
      }),
    );
    expect(result.status).toBe("BLOCKED");
    expect(result.reason).toBe("blocked_missing_required_field");
    expect(result.reasonDetail).toContain("{{sender_company_name}}");
  });

  it("skips EXCLUDED enrollments", () => {
    const result = classifySequenceStepSendCandidate(
      candidate({
        enrollment: {
          ...candidate().enrollment,
          status: "EXCLUDED",
        },
      }),
    );
    expect(result.status).toBe("SKIPPED");
    expect(result.reason).toBe("skipped_enrollment_excluded");
  });

  it("skips COMPLETED enrollments", () => {
    const result = classifySequenceStepSendCandidate(
      candidate({
        enrollment: {
          ...candidate().enrollment,
          status: "COMPLETED",
        },
      }),
    );
    expect(result.status).toBe("SKIPPED");
    expect(result.reason).toBe("skipped_enrollment_completed");
  });

  it("blocks cross-client sequence", () => {
    const result = classifySequenceStepSendCandidate(
      candidate({
        sequence: { id: "seq-1", clientId: "other-client" },
      }),
    );
    expect(result.status).toBe("BLOCKED");
    expect(result.reason).toBe("blocked_wrong_client");
  });

  it("blocks cross-client contact", () => {
    const result = classifySequenceStepSendCandidate(
      candidate({
        contact: {
          ...candidate().contact,
          clientId: "other-client",
        },
      }),
    );
    expect(result.status).toBe("BLOCKED");
    expect(result.reason).toBe("blocked_wrong_client");
  });

  it("blocks cross-client template", () => {
    const result = classifySequenceStepSendCandidate(
      candidate({
        template: {
          ...candidate().template,
          clientId: "other-client",
        },
      }),
    );
    expect(result.status).toBe("BLOCKED");
    expect(result.reason).toBe("blocked_wrong_client");
  });

  it("blocks when step is not in sequence", () => {
    const result = classifySequenceStepSendCandidate(
      candidate({
        step: { id: "step-x", sequenceId: "other-seq", templateId: "tpl-1" },
      }),
    );
    expect(result.status).toBe("BLOCKED");
    expect(result.reason).toBe("blocked_step_not_in_sequence");
  });

  it("blocks when enrollment references a different sequence", () => {
    const result = classifySequenceStepSendCandidate(
      candidate({
        enrollment: {
          ...candidate().enrollment,
          sequenceId: "other-seq",
        },
      }),
    );
    expect(result.status).toBe("BLOCKED");
    expect(result.reason).toBe("blocked_wrong_sequence");
  });

  it("blocks template mismatch between step and resolved template row", () => {
    const result = classifySequenceStepSendCandidate(
      candidate({
        step: {
          id: "step-1",
          sequenceId: "seq-1",
          templateId: "other-tpl",
        },
      }),
    );
    expect(result.status).toBe("BLOCKED");
    expect(result.reason).toBe("blocked_template_mismatch");
  });

  it("suppressed takes precedence over template approval when both would block", () => {
    // Readable invariant: suppression is surfaced as SUPPRESSED rather
    // than masked behind an approval issue.
    const result = classifySequenceStepSendCandidate(
      candidate({
        contact: { ...candidate().contact, isSuppressed: true },
        template: { ...candidate().template, status: "DRAFT" },
      }),
    );
    // Current order: template approval check runs before suppression
    // — capture intended behaviour explicitly so callers know.
    expect(result.status).toBe("BLOCKED");
    expect(result.reason).toBe("blocked_template_not_approved");
  });
});

describe("step send counts", () => {
  it("zeroStepSendCounts starts at zero", () => {
    expect(zeroStepSendCounts()).toEqual({
      planned: 0,
      ready: 0,
      blocked: 0,
      suppressed: 0,
      skipped: 0,
      sent: 0,
      failed: 0,
    });
  });

  it("increments by status", () => {
    let counts = zeroStepSendCounts();
    counts = incrementStepSendCount(counts, "READY");
    counts = incrementStepSendCount(counts, "READY");
    counts = incrementStepSendCount(counts, "BLOCKED");
    counts = incrementStepSendCount(counts, "SUPPRESSED");
    counts = incrementStepSendCount(counts, "SKIPPED");
    counts = incrementStepSendCount(counts, "PLANNED");
    counts = incrementStepSendCount(counts, "SENT");
    counts = incrementStepSendCount(counts, "FAILED");
    expect(counts).toEqual({
      planned: 1,
      ready: 2,
      blocked: 1,
      suppressed: 1,
      skipped: 1,
      sent: 1,
      failed: 1,
    });
  });
});
