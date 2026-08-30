import { describe, expect, it } from "vitest";

import {
  canApproveTemplate,
  canTransitionStatus,
  describeTemplateDeleteEligibility,
  isTemplateStatusUsableInSequence,
  TEMPLATE_CATEGORY_LABELS,
  TEMPLATE_CATEGORY_ORDER,
  TEMPLATE_STATUS_LABELS,
  TEMPLATE_STATUS_ORDER,
  validateTemplateInput,
} from "./template-policy";

const validBase = {
  name: "Intro v1",
  category: "INTRODUCTION" as const,
  subject: "Quick question, {{first_name}}",
  content:
    "Hi {{first_name}} at {{company_name}} — we help.\n\n{{sender_name}}\n{{email_signature}}\n{{unsubscribe_link}}",
};

describe("validateTemplateInput", () => {
  it("accepts a complete template with only known placeholders", () => {
    const res = validateTemplateInput(validBase);
    expect(res.ok).toBe(true);
    expect(res.issues).toEqual([]);
    expect(res.placeholders.unknown).toEqual([]);
    expect(res.placeholders.knownUsed.sort()).toEqual([
      "company_name",
      "email_signature",
      "first_name",
      "sender_name",
      "unsubscribe_link",
    ]);
  });

  it("flags missing required fields", () => {
    const res = validateTemplateInput({
      name: "",
      category: null,
      subject: "",
      content: "   ",
    });
    expect(res.ok).toBe(false);
    const fields = res.issues.map((i) => i.field).sort();
    expect(fields).toEqual(["category", "content", "name", "subject"]);
  });

  it("rejects an unknown category value", () => {
    const res = validateTemplateInput({
      ...validBase,
      category: "FOLLOW_UP_9",
    });
    expect(res.ok).toBe(false);
    expect(res.issues.some((i) => i.field === "category")).toBe(true);
  });

  it("reports unknown placeholders but keeps validation.ok=true for structural checks", () => {
    const res = validateTemplateInput({
      ...validBase,
      subject: "Hi {{first_name}} about {{deal_amount}}",
      content: "Regards {{sender_name}} ({{mystery}})",
    });
    // Structural fields are fine — issues array is empty
    expect(res.ok).toBe(true);
    // But unknown placeholders surface for the approval gate
    expect(res.placeholders.unknown.sort()).toEqual(["deal_amount", "mystery"]);
  });

  it("enforces length caps", () => {
    const longName = "a".repeat(130);
    const res = validateTemplateInput({ ...validBase, name: longName });
    expect(res.ok).toBe(false);
    expect(res.issues.some((i) => i.field === "name")).toBe(true);
  });
});

describe("canApproveTemplate", () => {
  it("approves when structural + placeholder checks all pass", () => {
    expect(canApproveTemplate(validBase)).toEqual({ ok: true });
  });

  it("blocks approval when structural fields are missing", () => {
    const result = canApproveTemplate({ ...validBase, subject: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid_input");
    }
  });

  it("blocks approval when any unknown placeholder is present", () => {
    const result = canApproveTemplate({
      ...validBase,
      content: `${validBase.content}\nPS: {{mystery_field}}`,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("unknown_placeholders");
      expect(result.details.placeholders.unknown).toEqual(["mystery_field"]);
    }
  });
});

describe("canTransitionStatus", () => {
  it("enforces the expected forward path", () => {
    expect(canTransitionStatus("DRAFT", "READY_FOR_REVIEW")).toBe(true);
    expect(canTransitionStatus("READY_FOR_REVIEW", "APPROVED")).toBe(true);
    expect(canTransitionStatus("APPROVED", "ARCHIVED")).toBe(true);
  });

  it("allows pulling a template back for edits", () => {
    expect(canTransitionStatus("READY_FOR_REVIEW", "DRAFT")).toBe(true);
    expect(canTransitionStatus("APPROVED", "DRAFT")).toBe(true);
  });

  it("allows archive from every non-archive state and restore from archive to draft", () => {
    expect(canTransitionStatus("DRAFT", "ARCHIVED")).toBe(true);
    expect(canTransitionStatus("READY_FOR_REVIEW", "ARCHIVED")).toBe(true);
    expect(canTransitionStatus("APPROVED", "ARCHIVED")).toBe(true);
    expect(canTransitionStatus("ARCHIVED", "DRAFT")).toBe(true);
  });

  it("rejects disallowed jumps and no-ops", () => {
    expect(canTransitionStatus("DRAFT", "APPROVED")).toBe(false);
    expect(canTransitionStatus("DRAFT", "DRAFT")).toBe(false);
    expect(canTransitionStatus("ARCHIVED", "APPROVED")).toBe(false);
    expect(canTransitionStatus("ARCHIVED", "READY_FOR_REVIEW")).toBe(false);
  });
});

describe("label / order exports", () => {
  it("has exactly six ordered categories with human labels", () => {
    expect(TEMPLATE_CATEGORY_ORDER).toEqual([
      "INTRODUCTION",
      "FOLLOW_UP_1",
      "FOLLOW_UP_2",
      "FOLLOW_UP_3",
      "FOLLOW_UP_4",
      "FOLLOW_UP_5",
    ]);
    expect(TEMPLATE_CATEGORY_LABELS.INTRODUCTION).toBe("Introduction email");
    expect(TEMPLATE_CATEGORY_LABELS.FOLLOW_UP_5).toBe("Follow-up 5");
  });

  it("has four ordered statuses with human labels", () => {
    expect(TEMPLATE_STATUS_ORDER).toEqual([
      "DRAFT",
      "READY_FOR_REVIEW",
      "APPROVED",
      "ARCHIVED",
    ]);
    expect(TEMPLATE_STATUS_LABELS.READY_FOR_REVIEW).toBe("In review");
  });
});

// Row 130 — "the screen has no way to remove a template and no structure
// telling an operator what they can actually use." These two functions are
// the single source of truth for both halves of that complaint.
describe("isTemplateStatusUsableInSequence", () => {
  it("is true for every status except ARCHIVED — matches canApproveSequence exactly", () => {
    expect(isTemplateStatusUsableInSequence("DRAFT")).toBe(true);
    expect(isTemplateStatusUsableInSequence("READY_FOR_REVIEW")).toBe(true);
    expect(isTemplateStatusUsableInSequence("APPROVED")).toBe(true);
    expect(isTemplateStatusUsableInSequence("ARCHIVED")).toBe(false);
  });
});

describe("describeTemplateDeleteEligibility", () => {
  it("allows deleting a template never placed in a sequence step and with no send history", () => {
    const decision = describeTemplateDeleteEligibility({
      sequenceSteps: 0,
      sequenceStepSends: 0,
    });
    expect(decision).toEqual({ canDelete: true, reason: null });
  });

  it("refuses a template that is used in a sequence step, with a readable reason naming the count", () => {
    const decision = describeTemplateDeleteEligibility({
      sequenceSteps: 2,
      sequenceStepSends: 0,
    });
    expect(decision.canDelete).toBe(false);
    if (decision.canDelete) throw new Error("unreachable");
    expect(decision.reason).toContain("2 sequence steps");
    expect(decision.reason).toContain("only be archived");
  });

  it("refuses a template with real send history, even if no live sequence step remains, using send-specific wording", () => {
    const decision = describeTemplateDeleteEligibility({
      sequenceSteps: 0,
      sequenceStepSends: 3,
    });
    expect(decision.canDelete).toBe(false);
    if (decision.canDelete) throw new Error("unreachable");
    expect(decision.reason).toContain("3 real emails");
  });

  it("uses singular wording for exactly one use", () => {
    const stepDecision = describeTemplateDeleteEligibility({
      sequenceSteps: 1,
      sequenceStepSends: 0,
    });
    if (stepDecision.canDelete) throw new Error("unreachable");
    expect(stepDecision.reason).toContain("a sequence step");
    expect(stepDecision.reason).not.toContain("1 sequence steps");

    const sendDecision = describeTemplateDeleteEligibility({
      sequenceSteps: 1,
      sequenceStepSends: 1,
    });
    if (sendDecision.canDelete) throw new Error("unreachable");
    expect(sendDecision.reason).toContain("a real email");
  });
});
