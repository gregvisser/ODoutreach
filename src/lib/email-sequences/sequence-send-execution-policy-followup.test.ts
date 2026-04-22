import { describe, expect, it } from "vitest";

import type { ClientEmailTemplateCategory } from "@/generated/prisma/enums";

import type { SequenceStepSendCandidate } from "./sequence-send-policy";
import {
  classifySequenceStepSendExecution,
  incrementSequenceStepSendPlanCounts,
  previousCategoryFor,
  zeroSequenceStepSendPlanCounts,
  type SequenceStepSendExecutionInput,
  type SequenceStepSendPreviousStep,
} from "./sequence-send-execution-policy";

/**
 * PR D4e.3 — tests for the generic category-aware dispatcher policy.
 *
 * The D4e.2 INTRODUCTION tests in `sequence-send-execution-policy.test
 * .ts` still pass against the wrapper, so these tests focus on the
 * new follow-up behaviour: previous-step + delay guards, position
 * sanity, and the generic counters.
 */

function baseCandidate(
  overrides: Partial<SequenceStepSendCandidate> = {},
): SequenceStepSendCandidate {
  const clientId = overrides.clientId ?? "client-1";
  return {
    clientId,
    sequence: overrides.sequence ?? { id: "seq-1", clientId },
    step:
      overrides.step ??
      ({
        id: "step-2",
        sequenceId: "seq-1",
        templateId: "tpl-2",
      } as const),
    template:
      overrides.template ??
      ({
        id: "tpl-2",
        clientId,
        status: "APPROVED",
        subject: "Following up {{first_name}}",
        content: "Hi {{first_name}},\n\nStill here.\n\n—{{sender_name}}",
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
        email: "ada@bidlow.co.uk",
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

function sentPreviousStep(sentAtIso: string): SequenceStepSendPreviousStep {
  return { status: "SENT", sentAtIso };
}

function baseInput(
  overrides: Partial<SequenceStepSendExecutionInput> = {},
): SequenceStepSendExecutionInput {
  const category: ClientEmailTemplateCategory =
    overrides.category ?? "FOLLOW_UP_1";
  return {
    category,
    stepSend: overrides.stepSend ?? {
      id: "sss-2",
      status: "READY",
      outboundEmailId: null,
    },
    stepCategory: overrides.stepCategory ?? category,
    candidate: overrides.candidate ?? baseCandidate(),
    allowlist: overrides.allowlist ?? {
      configured: true,
      domains: ["bidlow.co.uk"],
    },
    previousStepSend:
      overrides.previousStepSend === undefined
        ? sentPreviousStep("2026-04-10T00:00:00Z")
        : overrides.previousStepSend,
    delayDays: overrides.delayDays ?? 3,
    nowIso: overrides.nowIso ?? "2026-04-15T00:00:00Z",
    enrollmentCurrentStepPosition:
      overrides.enrollmentCurrentStepPosition ?? 1,
    stepPosition: overrides.stepPosition ?? 2,
  };
}

describe("previousCategoryFor", () => {
  it("maps every follow-up to the immediately prior category", () => {
    expect(previousCategoryFor("INTRODUCTION")).toBe(null);
    expect(previousCategoryFor("FOLLOW_UP_1")).toBe("INTRODUCTION");
    expect(previousCategoryFor("FOLLOW_UP_2")).toBe("FOLLOW_UP_1");
    expect(previousCategoryFor("FOLLOW_UP_3")).toBe("FOLLOW_UP_2");
    expect(previousCategoryFor("FOLLOW_UP_4")).toBe("FOLLOW_UP_3");
    expect(previousCategoryFor("FOLLOW_UP_5")).toBe("FOLLOW_UP_4");
  });
});

describe("classifySequenceStepSendExecution — INTRODUCTION", () => {
  it("returns sendable for the same inputs D4e.2 accepted", () => {
    const decision = classifySequenceStepSendExecution({
      category: "INTRODUCTION",
      stepCategory: "INTRODUCTION",
      stepSend: { id: "sss-1", status: "READY", outboundEmailId: null },
      candidate: baseCandidate({
        step: { id: "step-1", sequenceId: "seq-1", templateId: "tpl-1" },
        template: {
          id: "tpl-1",
          clientId: "client-1",
          status: "APPROVED",
          subject: "Hello {{first_name}}",
          content: "Hi {{first_name}},\n\nRegards,\n{{sender_name}}",
        },
      }),
      allowlist: { configured: true, domains: ["bidlow.co.uk"] },
      previousStepSend: null,
      delayDays: 0,
      nowIso: "2026-04-15T00:00:00Z",
    });
    expect(decision.sendable).toBe(true);
    if (decision.sendable) {
      expect(decision.allowlistedDomain).toBe("bidlow.co.uk");
    }
  });

  it("does NOT require a previous step or delay for INTRODUCTION", () => {
    const decision = classifySequenceStepSendExecution({
      category: "INTRODUCTION",
      stepCategory: "INTRODUCTION",
      stepSend: { id: "sss-1", status: "READY", outboundEmailId: null },
      candidate: baseCandidate({
        step: { id: "step-1", sequenceId: "seq-1", templateId: "tpl-1" },
        template: {
          id: "tpl-1",
          clientId: "client-1",
          status: "APPROVED",
          subject: "Hi {{first_name}}",
          content: "Hi {{first_name}},\n\n—{{sender_name}}",
        },
      }),
      allowlist: { configured: true, domains: ["bidlow.co.uk"] },
      previousStepSend: null,
      delayDays: 0,
      nowIso: "2026-04-15T00:00:00Z",
    });
    expect(decision.sendable).toBe(true);
  });
});

describe("classifySequenceStepSendExecution — FOLLOW_UP_1 previous-step guard", () => {
  it("blocks when no previous-step SENT row exists", () => {
    const decision = classifySequenceStepSendExecution(
      baseInput({ previousStepSend: null }),
    );
    expect(decision).toMatchObject({
      sendable: false,
      reason: "blocked_previous_step_not_sent",
    });
  });

  it("blocks when the previous step row is not SENT", () => {
    const decision = classifySequenceStepSendExecution(
      baseInput({
        previousStepSend: {
          status: "READY",
          sentAtIso: "2026-04-10T00:00:00Z",
        },
      }),
    );
    expect(decision).toMatchObject({
      sendable: false,
      reason: "blocked_previous_step_not_sent",
    });
  });

  it("allows when previous step is SENT and delay has elapsed", () => {
    const decision = classifySequenceStepSendExecution(
      baseInput({
        previousStepSend: sentPreviousStep("2026-04-10T00:00:00Z"),
        delayDays: 3,
        nowIso: "2026-04-15T00:00:00Z",
      }),
    );
    expect(decision.sendable).toBe(true);
    if (decision.sendable) {
      expect(decision.allowlistedDomain).toBe("bidlow.co.uk");
    }
  });

  it("allows when delayDays is 0 and previous step is SENT immediately", () => {
    const decision = classifySequenceStepSendExecution(
      baseInput({
        previousStepSend: sentPreviousStep("2026-04-15T00:00:00Z"),
        delayDays: 0,
        nowIso: "2026-04-15T00:00:00Z",
      }),
    );
    expect(decision.sendable).toBe(true);
  });
});

describe("classifySequenceStepSendExecution — FOLLOW_UP_1 delay guard", () => {
  it("blocks while the delay has not elapsed", () => {
    const decision = classifySequenceStepSendExecution(
      baseInput({
        previousStepSend: sentPreviousStep("2026-04-14T00:00:00Z"),
        delayDays: 3,
        nowIso: "2026-04-15T00:00:00Z",
      }),
    );
    expect(decision).toMatchObject({
      sendable: false,
      reason: "blocked_delay_not_elapsed",
    });
  });

  it("allows when now is exactly `sentAt + delayDays`", () => {
    const decision = classifySequenceStepSendExecution(
      baseInput({
        previousStepSend: sentPreviousStep("2026-04-12T00:00:00Z"),
        delayDays: 3,
        nowIso: "2026-04-15T00:00:00Z",
      }),
    );
    expect(decision.sendable).toBe(true);
  });

  it("blocks when now is one second before `sentAt + delayDays`", () => {
    const decision = classifySequenceStepSendExecution(
      baseInput({
        previousStepSend: sentPreviousStep("2026-04-12T00:00:00Z"),
        delayDays: 3,
        nowIso: "2026-04-14T23:59:59Z",
      }),
    );
    expect(decision).toMatchObject({
      sendable: false,
      reason: "blocked_delay_not_elapsed",
    });
  });

  it("treats malformed timestamps as blocked_delay_not_elapsed (fail-closed)", () => {
    const decision = classifySequenceStepSendExecution(
      baseInput({
        previousStepSend: { status: "SENT", sentAtIso: "not-an-iso" },
      }),
    );
    expect(decision).toMatchObject({
      sendable: false,
      reason: "blocked_delay_not_elapsed",
    });
  });
});

describe("classifySequenceStepSendExecution — position sanity", () => {
  it("blocks when enrollment is already at or past this step's position", () => {
    const decision = classifySequenceStepSendExecution(
      baseInput({
        enrollmentCurrentStepPosition: 2,
        stepPosition: 2,
      }),
    );
    expect(decision).toMatchObject({
      sendable: false,
      reason: "blocked_wrong_position",
    });
  });

  it("allows when enrollment is at the previous step's position", () => {
    const decision = classifySequenceStepSendExecution(
      baseInput({
        enrollmentCurrentStepPosition: 1,
        stepPosition: 2,
      }),
    );
    expect(decision.sendable).toBe(true);
  });
});

describe("classifySequenceStepSendExecution — shared D4e.2 gates still hold", () => {
  it("blocks when the allowlist is not configured", () => {
    const decision = classifySequenceStepSendExecution(
      baseInput({ allowlist: { configured: false, domains: [] } }),
    );
    expect(decision).toMatchObject({
      sendable: false,
      reason: "blocked_allowlist_not_configured",
    });
  });

  it("blocks a non-allowlisted recipient domain", () => {
    const decision = classifySequenceStepSendExecution(
      baseInput({
        candidate: baseCandidate({
          contact: {
            id: "ct-1",
            clientId: "client-1",
            firstName: "Ada",
            lastName: "Lovelace",
            fullName: "Ada Lovelace",
            company: "Analytical",
            role: null,
            website: null,
            email: "ada@prospect.com",
            mobilePhone: null,
            officePhone: null,
            isSuppressed: false,
          },
        }),
      }),
    );
    expect(decision).toMatchObject({
      sendable: false,
      reason: "blocked_allowlist_domain",
    });
  });

  it("blocks a suppressed recipient via the plan-classifier", () => {
    const decision = classifySequenceStepSendExecution(
      baseInput({
        candidate: baseCandidate({
          contact: {
            id: "ct-1",
            clientId: "client-1",
            firstName: "Ada",
            lastName: "Lovelace",
            fullName: "Ada Lovelace",
            company: "Analytical",
            role: null,
            website: null,
            email: "ada@bidlow.co.uk",
            mobilePhone: null,
            officePhone: null,
            isSuppressed: true,
          },
        }),
      }),
    );
    expect(decision).toMatchObject({
      sendable: false,
      reason: "blocked_plan_classifier",
    });
  });

  it("blocks a missing email via the plan-classifier", () => {
    const decision = classifySequenceStepSendExecution(
      baseInput({
        candidate: baseCandidate({
          contact: {
            id: "ct-1",
            clientId: "client-1",
            firstName: "Ada",
            lastName: "Lovelace",
            fullName: "Ada Lovelace",
            company: "Analytical",
            role: null,
            website: null,
            email: null,
            mobilePhone: null,
            officePhone: null,
            isSuppressed: false,
          },
        }),
      }),
    );
    expect(decision).toMatchObject({
      sendable: false,
      reason: "blocked_plan_classifier",
    });
  });

  it("blocks when the stepSend is already SENT", () => {
    const decision = classifySequenceStepSendExecution(
      baseInput({
        stepSend: { id: "sss-2", status: "SENT", outboundEmailId: null },
      }),
    );
    expect(decision).toMatchObject({
      sendable: false,
      reason: "blocked_already_sent",
    });
  });

  it("blocks when an OutboundEmail is already linked", () => {
    const decision = classifySequenceStepSendExecution(
      baseInput({
        stepSend: {
          id: "sss-2",
          status: "READY",
          outboundEmailId: "ob-1",
        },
      }),
    );
    expect(decision).toMatchObject({
      sendable: false,
      reason: "blocked_already_linked_outbound",
    });
  });

  it("blocks when stepCategory does not match the dispatcher's category", () => {
    const decision = classifySequenceStepSendExecution(
      baseInput({
        category: "FOLLOW_UP_1",
        stepCategory: "FOLLOW_UP_2",
      }),
    );
    expect(decision).toMatchObject({
      sendable: false,
      reason: "blocked_wrong_category",
    });
  });

  it("blocks when the stored plan row is BLOCKED/SUPPRESSED/SKIPPED", () => {
    for (const status of ["BLOCKED", "SUPPRESSED", "SKIPPED"] as const) {
      const decision = classifySequenceStepSendExecution(
        baseInput({
          stepSend: { id: "sss-2", status, outboundEmailId: null },
        }),
      );
      expect(decision.sendable).toBe(false);
    }
  });
});

describe("classifySequenceStepSendExecution — FOLLOW_UP_2 requires FOLLOW_UP_1", () => {
  it("blocks FOLLOW_UP_2 when FOLLOW_UP_1 is not SENT", () => {
    const decision = classifySequenceStepSendExecution(
      baseInput({
        category: "FOLLOW_UP_2",
        stepCategory: "FOLLOW_UP_2",
        previousStepSend: null,
      }),
    );
    expect(decision).toMatchObject({
      sendable: false,
      reason: "blocked_previous_step_not_sent",
    });
    // The detail string should mention FOLLOW_UP_1 (the prior cat).
    if (!decision.sendable) {
      expect(decision.detail).toMatch(/FOLLOW_UP_1/);
    }
  });

  it("allows FOLLOW_UP_2 when FOLLOW_UP_1 is SENT and delay elapsed", () => {
    const decision = classifySequenceStepSendExecution(
      baseInput({
        category: "FOLLOW_UP_2",
        stepCategory: "FOLLOW_UP_2",
        previousStepSend: sentPreviousStep("2026-04-10T00:00:00Z"),
        delayDays: 3,
        nowIso: "2026-04-15T00:00:00Z",
        enrollmentCurrentStepPosition: 2,
        stepPosition: 3,
      }),
    );
    expect(decision.sendable).toBe(true);
  });
});

describe("aggregate counters (SequenceStepSendPlanCounts)", () => {
  it("counts sendable and blocked buckets correctly", () => {
    let counts = zeroSequenceStepSendPlanCounts();
    counts = incrementSequenceStepSendPlanCounts(
      counts,
      classifySequenceStepSendExecution(baseInput()),
    );
    counts = incrementSequenceStepSendPlanCounts(
      counts,
      classifySequenceStepSendExecution(
        baseInput({ allowlist: { configured: false, domains: [] } }),
      ),
    );
    counts = incrementSequenceStepSendPlanCounts(
      counts,
      classifySequenceStepSendExecution(
        baseInput({
          stepSend: { id: "x", status: "SENT", outboundEmailId: null },
        }),
      ),
    );
    counts = incrementSequenceStepSendPlanCounts(
      counts,
      classifySequenceStepSendExecution(
        baseInput({
          category: "FOLLOW_UP_1",
          stepCategory: "FOLLOW_UP_2",
        }),
      ),
    );
    counts = incrementSequenceStepSendPlanCounts(
      counts,
      classifySequenceStepSendExecution(
        baseInput({ previousStepSend: null }),
      ),
    );
    counts = incrementSequenceStepSendPlanCounts(
      counts,
      classifySequenceStepSendExecution(
        baseInput({
          previousStepSend: sentPreviousStep("2026-04-14T00:00:00Z"),
          delayDays: 3,
          nowIso: "2026-04-15T00:00:00Z",
        }),
      ),
    );
    expect(counts).toEqual({
      total: 6,
      sendable: 1,
      blockedAllowlist: 1,
      blockedNotReady: 0,
      blockedAlreadySent: 1,
      blockedWrongCategory: 1,
      blockedPlanClassifier: 0,
      blockedPrevious: 2,
      blockedLaunchApproval: 0,
    });
  });
});
