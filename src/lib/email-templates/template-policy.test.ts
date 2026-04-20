import { describe, expect, it } from "vitest";

import {
  canApproveTemplate,
  canTransitionStatus,
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
    expect(TEMPLATE_STATUS_LABELS.READY_FOR_REVIEW).toBe("Ready for review");
  });
});
