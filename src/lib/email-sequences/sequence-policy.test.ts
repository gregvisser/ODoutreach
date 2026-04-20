import { describe, expect, it } from "vitest";

import type { ClientEmailTemplateStatus } from "@/generated/prisma/enums";

import {
  canApproveSequence,
  canTransitionSequenceStatus,
  summarizeSequenceReadiness,
  validateSequenceInput,
  validateSequenceSteps,
  SEQUENCE_DELAY_DAYS_MAX,
  type SequenceStepInput,
} from "./sequence-policy";

function stepFor(
  category: SequenceStepInput["category"],
  position: number,
  overrides: Partial<SequenceStepInput> = {},
): SequenceStepInput {
  return {
    category,
    position,
    delayDays: category === "INTRODUCTION" ? 0 : 3,
    template: {
      id: `tpl-${category}-${String(position)}`,
      category,
      status: "APPROVED" as ClientEmailTemplateStatus,
      clientId: "client-1",
    },
    ...overrides,
  };
}

const populatedList = {
  id: "list-1",
  memberCount: 12,
  emailSendableCount: 8,
};

describe("validateSequenceInput", () => {
  it("accepts a complete metadata payload", () => {
    const res = validateSequenceInput({
      name: "UK launch — logistics",
      description: "Outbound ladder for logistics buyers",
      contactListId: "list-1",
    });
    expect(res.ok).toBe(true);
    expect(res.issues).toEqual([]);
  });

  it("requires a name and a contact list", () => {
    const res = validateSequenceInput({
      name: " ",
      description: null,
      contactListId: "",
    });
    expect(res.ok).toBe(false);
    const fields = res.issues.map((i) => i.field).sort();
    expect(fields).toEqual(["contactListId", "name"]);
  });

  it("rejects overlong description", () => {
    const res = validateSequenceInput({
      name: "OK",
      description: "x".repeat(1_001),
      contactListId: "list-1",
    });
    expect(res.ok).toBe(false);
    expect(res.issues.some((i) => i.field === "description")).toBe(true);
  });
});

describe("validateSequenceSteps", () => {
  it("accepts an introduction-only ready sequence", () => {
    const res = validateSequenceSteps({
      steps: [stepFor("INTRODUCTION", 1)],
      targetStatus: "READY_FOR_REVIEW",
      sequenceClientId: "client-1",
    });
    expect(res.ok).toBe(true);
    expect(res.issues).toEqual([]);
  });

  it("rejects duplicate categories", () => {
    const res = validateSequenceSteps({
      steps: [
        stepFor("INTRODUCTION", 1),
        stepFor("INTRODUCTION", 2),
      ],
      targetStatus: "DRAFT",
    });
    expect(res.issues.some((i) => i.code === "DUPLICATE_CATEGORY")).toBe(true);
  });

  it("rejects duplicate positions", () => {
    const res = validateSequenceSteps({
      steps: [
        stepFor("INTRODUCTION", 1),
        stepFor("FOLLOW_UP_1", 1),
      ],
      targetStatus: "DRAFT",
    });
    expect(res.issues.some((i) => i.code === "DUPLICATE_POSITION")).toBe(true);
  });

  it("rejects category/template mismatch", () => {
    const res = validateSequenceSteps({
      steps: [
        stepFor("INTRODUCTION", 1, {
          template: {
            id: "tpl-wrong",
            category: "FOLLOW_UP_1",
            status: "APPROVED",
            clientId: "client-1",
          },
        }),
      ],
      targetStatus: "DRAFT",
    });
    expect(res.issues.some((i) => i.code === "CATEGORY_MISMATCH")).toBe(true);
  });

  it("allows unapproved templates in DRAFT but blocks them at READY", () => {
    const draft = validateSequenceSteps({
      steps: [
        stepFor("INTRODUCTION", 1, {
          template: {
            id: "tpl-draft",
            category: "INTRODUCTION",
            status: "DRAFT",
            clientId: "client-1",
          },
        }),
      ],
      targetStatus: "DRAFT",
    });
    expect(draft.ok).toBe(true);

    const ready = validateSequenceSteps({
      steps: [
        stepFor("INTRODUCTION", 1, {
          template: {
            id: "tpl-draft",
            category: "INTRODUCTION",
            status: "DRAFT",
            clientId: "client-1",
          },
        }),
      ],
      targetStatus: "READY_FOR_REVIEW",
    });
    expect(ready.issues.some((i) => i.code === "TEMPLATE_NOT_APPROVED")).toBe(
      true,
    );
  });

  it("rejects negative delays and introduction delays", () => {
    const res = validateSequenceSteps({
      steps: [
        stepFor("INTRODUCTION", 1, { delayDays: 2 }),
        stepFor("FOLLOW_UP_1", 2, { delayDays: -1 }),
      ],
      targetStatus: "DRAFT",
    });
    expect(res.issues.some((i) => i.code === "INTRODUCTION_DELAY")).toBe(true);
    expect(res.issues.some((i) => i.code === "NEGATIVE_DELAY")).toBe(true);
  });

  it("rejects overlong delays", () => {
    const res = validateSequenceSteps({
      steps: [
        stepFor("INTRODUCTION", 1),
        stepFor("FOLLOW_UP_1", 2, { delayDays: SEQUENCE_DELAY_DAYS_MAX + 1 }),
      ],
      targetStatus: "DRAFT",
    });
    expect(res.issues.some((i) => i.code === "DELAY_TOO_LARGE")).toBe(true);
  });

  it("requires an introduction for ready/approved", () => {
    const res = validateSequenceSteps({
      steps: [stepFor("FOLLOW_UP_1", 1)],
      targetStatus: "APPROVED",
    });
    expect(res.issues.some((i) => i.code === "MISSING_INTRODUCTION")).toBe(true);
  });

  it("flags zero steps at ready/approved", () => {
    const res = validateSequenceSteps({
      steps: [],
      targetStatus: "READY_FOR_REVIEW",
    });
    expect(res.issues.some((i) => i.code === "NO_STEPS")).toBe(true);
  });

  it("flags template from wrong client", () => {
    const res = validateSequenceSteps({
      steps: [
        stepFor("INTRODUCTION", 1, {
          template: {
            id: "tpl-other",
            category: "INTRODUCTION",
            status: "APPROVED",
            clientId: "client-other",
          },
        }),
      ],
      targetStatus: "DRAFT",
      sequenceClientId: "client-1",
    });
    expect(res.issues.some((i) => i.code === "TEMPLATE_WRONG_CLIENT")).toBe(
      true,
    );
  });
});

describe("summarizeSequenceReadiness", () => {
  it("is approvable when list + approved intro + sendable contacts are present", () => {
    const readiness = summarizeSequenceReadiness({
      contactList: populatedList,
      steps: [stepFor("INTRODUCTION", 1), stepFor("FOLLOW_UP_1", 2)],
    });
    expect(readiness.hasContactList).toBe(true);
    expect(readiness.emailSendableCount).toBe(8);
    expect(readiness.approvedIntroduction).toBe(true);
    expect(readiness.approvedFollowUpCount).toBe(1);
    expect(readiness.unapprovedStepCount).toBe(0);
    expect(readiness.canBeApproved).toBe(true);
  });

  it("blocks approval when there is no contact list", () => {
    const decision = canApproveSequence({
      contactList: null,
      steps: [stepFor("INTRODUCTION", 1)],
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.reason).toBe("no_contact_list");
  });

  it("blocks approval when the list has zero email-sendable contacts", () => {
    const decision = canApproveSequence({
      contactList: { id: "list-1", memberCount: 5, emailSendableCount: 0 },
      steps: [stepFor("INTRODUCTION", 1)],
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.reason).toBe("empty_list");
  });

  it("blocks approval when the introduction is unapproved", () => {
    const decision = canApproveSequence({
      contactList: populatedList,
      steps: [
        stepFor("INTRODUCTION", 1, {
          template: {
            id: "tpl-draft-intro",
            category: "INTRODUCTION",
            status: "DRAFT",
            clientId: "client-1",
          },
        }),
      ],
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.reason).toBe("missing_introduction");
  });

  it("blocks approval when any follow-up is unapproved", () => {
    const decision = canApproveSequence({
      contactList: populatedList,
      steps: [
        stepFor("INTRODUCTION", 1),
        stepFor("FOLLOW_UP_1", 2, {
          template: {
            id: "tpl-draft-fu",
            category: "FOLLOW_UP_1",
            status: "READY_FOR_REVIEW",
            clientId: "client-1",
          },
        }),
      ],
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.reason).toBe("unapproved_step");
  });

  it("blocks approval when a step category mismatches its template", () => {
    const decision = canApproveSequence({
      contactList: populatedList,
      steps: [
        stepFor("INTRODUCTION", 1, {
          template: {
            id: "tpl-mismatch",
            category: "FOLLOW_UP_1",
            status: "APPROVED",
            clientId: "client-1",
          },
        }),
      ],
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.reason).toBe("category_mismatch");
  });
});

describe("canTransitionSequenceStatus", () => {
  it("mirrors the template lifecycle transitions", () => {
    expect(canTransitionSequenceStatus("DRAFT", "READY_FOR_REVIEW")).toBe(true);
    expect(canTransitionSequenceStatus("READY_FOR_REVIEW", "APPROVED")).toBe(true);
    expect(canTransitionSequenceStatus("APPROVED", "ARCHIVED")).toBe(true);
    expect(canTransitionSequenceStatus("APPROVED", "DRAFT")).toBe(true);
    expect(canTransitionSequenceStatus("ARCHIVED", "DRAFT")).toBe(true);
    expect(canTransitionSequenceStatus("DRAFT", "APPROVED")).toBe(false);
    expect(canTransitionSequenceStatus("ARCHIVED", "APPROVED")).toBe(false);
    expect(canTransitionSequenceStatus("DRAFT", "DRAFT")).toBe(false);
  });
});
