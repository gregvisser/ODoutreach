import { describe, expect, it } from "vitest";

import type { SequenceStepSendCandidate } from "./sequence-send-policy";
import {
  classifySequenceIntroSendExecution,
  incrementSequenceIntroSendPlanCounts,
  isRecipientDomainAllowedForSequenceIntroSend,
  zeroSequenceIntroSendPlanCounts,
  type SequenceIntroSendExecutionInput,
} from "./sequence-send-execution-policy";

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

function baseInput(
  overrides: Partial<SequenceIntroSendExecutionInput> = {},
): SequenceIntroSendExecutionInput {
  return {
    stepSend: overrides.stepSend ?? {
      id: "sss-1",
      status: "READY",
      outboundEmailId: null,
    },
    stepCategory: overrides.stepCategory ?? "INTRODUCTION",
    candidate: overrides.candidate ?? baseCandidate(),
    allowlist: overrides.allowlist ?? {
      configured: true,
      domains: ["bidlow.co.uk"],
    },
  };
}

describe("isRecipientDomainAllowedForSequenceIntroSend", () => {
  it("accepts an allowlisted domain", () => {
    expect(
      isRecipientDomainAllowedForSequenceIntroSend("ada@bidlow.co.uk", {
        configured: true,
        domains: ["bidlow.co.uk"],
      }),
    ).toMatchObject({ allowed: true, domain: "bidlow.co.uk" });
  });

  it("rejects when allowlist is not configured", () => {
    expect(
      isRecipientDomainAllowedForSequenceIntroSend("ada@bidlow.co.uk", {
        configured: false,
        domains: [],
      }),
    ).toMatchObject({ allowed: false, reason: "not_configured" });
  });

  it("rejects when allowlist is configured but empty", () => {
    expect(
      isRecipientDomainAllowedForSequenceIntroSend("ada@bidlow.co.uk", {
        configured: true,
        domains: [],
      }),
    ).toMatchObject({ allowed: false, reason: "allowlist_empty" });
  });

  it("rejects a non-allowlisted domain", () => {
    expect(
      isRecipientDomainAllowedForSequenceIntroSend("ada@prospect.com", {
        configured: true,
        domains: ["bidlow.co.uk"],
      }),
    ).toMatchObject({ allowed: false, reason: "domain_blocked" });
  });

  it("rejects missing or malformed emails", () => {
    for (const bad of [null, undefined, "", "no-at-sign", "trailing@"]) {
      expect(
        isRecipientDomainAllowedForSequenceIntroSend(bad, {
          configured: true,
          domains: ["bidlow.co.uk"],
        }),
      ).toMatchObject({ allowed: false });
    }
  });

  it("normalises case on the domain", () => {
    expect(
      isRecipientDomainAllowedForSequenceIntroSend("Ada@BIDLOW.co.uk", {
        configured: true,
        domains: ["bidlow.co.uk"],
      }),
    ).toMatchObject({ allowed: true, domain: "bidlow.co.uk" });
  });
});

describe("classifySequenceIntroSendExecution", () => {
  it("returns sendable for a READY + allowlisted INTRODUCTION row", () => {
    const decision = classifySequenceIntroSendExecution(baseInput());
    expect(decision.sendable).toBe(true);
    if (decision.sendable) {
      expect(decision.allowlistedDomain).toBe("bidlow.co.uk");
      expect(decision.classification.status).toBe("READY");
    }
  });

  it("blocks when the step is not INTRODUCTION", () => {
    const decision = classifySequenceIntroSendExecution(
      baseInput({ stepCategory: "FOLLOW_UP_1" }),
    );
    expect(decision).toMatchObject({
      sendable: false,
      reason: "blocked_not_introduction_step",
    });
  });

  it("blocks when the stored status is already SENT", () => {
    const decision = classifySequenceIntroSendExecution(
      baseInput({
        stepSend: { id: "sss-1", status: "SENT", outboundEmailId: null },
      }),
    );
    expect(decision).toMatchObject({
      sendable: false,
      reason: "blocked_already_sent",
    });
  });

  it("blocks when an OutboundEmail is already linked", () => {
    const decision = classifySequenceIntroSendExecution(
      baseInput({
        stepSend: {
          id: "sss-1",
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

  it("blocks when the stored plan row is BLOCKED/SUPPRESSED/SKIPPED", () => {
    for (const status of ["BLOCKED", "SUPPRESSED", "SKIPPED"] as const) {
      const decision = classifySequenceIntroSendExecution(
        baseInput({
          stepSend: { id: "sss-1", status, outboundEmailId: null },
        }),
      );
      expect(decision.sendable).toBe(false);
      if (!decision.sendable) {
        // Plan-classifier may have passed (row was re-planned in
        // between) but we still refuse because the stored status
        // means operator hasn't re-confirmed.
        expect([
          "blocked_not_ready",
          "blocked_plan_classifier",
        ]).toContain(decision.reason);
      }
    }
  });

  it("blocks when allowlist is not configured", () => {
    const decision = classifySequenceIntroSendExecution(
      baseInput({ allowlist: { configured: false, domains: [] } }),
    );
    expect(decision).toMatchObject({
      sendable: false,
      reason: "blocked_allowlist_not_configured",
    });
  });

  it("blocks when allowlist is configured but empty", () => {
    const decision = classifySequenceIntroSendExecution(
      baseInput({ allowlist: { configured: true, domains: [] } }),
    );
    expect(decision).toMatchObject({
      sendable: false,
      reason: "blocked_allowlist_domain",
    });
  });

  it("blocks a non-allowlisted recipient domain", () => {
    const decision = classifySequenceIntroSendExecution(
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

  it("blocks when the plan-time classifier would fail (suppressed recipient)", () => {
    const decision = classifySequenceIntroSendExecution(
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

  it("blocks when the plan-time classifier fails on missing email", () => {
    const decision = classifySequenceIntroSendExecution(
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

  it("blocks when template is not APPROVED (classifier fallback)", () => {
    const decision = classifySequenceIntroSendExecution(
      baseInput({
        candidate: baseCandidate({
          template: {
            id: "tpl-1",
            clientId: "client-1",
            status: "DRAFT",
            subject: "Hello {{first_name}}",
            content: "Hi,",
          },
        }),
      }),
    );
    expect(decision).toMatchObject({
      sendable: false,
      reason: "blocked_plan_classifier",
    });
  });
});

describe("aggregate counters", () => {
  it("counts sendable and blocked buckets correctly", () => {
    let counts = zeroSequenceIntroSendPlanCounts();
    counts = incrementSequenceIntroSendPlanCounts(
      counts,
      classifySequenceIntroSendExecution(baseInput()),
    );
    counts = incrementSequenceIntroSendPlanCounts(
      counts,
      classifySequenceIntroSendExecution(
        baseInput({ allowlist: { configured: false, domains: [] } }),
      ),
    );
    counts = incrementSequenceIntroSendPlanCounts(
      counts,
      classifySequenceIntroSendExecution(
        baseInput({
          stepSend: { id: "x", status: "SENT", outboundEmailId: null },
        }),
      ),
    );
    counts = incrementSequenceIntroSendPlanCounts(
      counts,
      classifySequenceIntroSendExecution(
        baseInput({ stepCategory: "FOLLOW_UP_1" }),
      ),
    );
    expect(counts).toEqual({
      total: 4,
      sendable: 1,
      blockedAllowlist: 1,
      blockedNotReady: 0,
      blockedAlreadySent: 1,
      blockedNotIntroduction: 1,
      blockedPlanClassifier: 0,
    });
  });
});
