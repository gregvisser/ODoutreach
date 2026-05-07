import { describe, expect, it } from "vitest";

import {
  clientMustBeLaunchApprovedForRealProspectSend,
  evaluateClientLaunchApproval,
  humanizeClientLaunchApprovalMode,
  isLaunchApprovalConfirmationValid,
  LAUNCH_APPROVAL_CONFIRMATION_PHRASE,
  type LaunchApprovalPolicyInput,
} from "./client-launch-approval";
import type { GettingStartedViewModel } from "./getting-started-view-model";

function makeGettingStarted(
  overrides: Partial<Record<string, boolean>> = {},
): Pick<GettingStartedViewModel, "items"> {
  const ids = [
    "brief",
    "mailboxes",
    "suppression",
    "contacts",
    "templates",
    "sequences",
    "enrollments",
    "launch",
  ] as const;
  return {
    items: ids.map((id) => ({
      id,
      label: id,
      description: id,
      href: `/clients/c1/${id}`,
      done: overrides[id] ?? false,
    })),
  };
}

function makeReadinessRows(
  overrides: Partial<
    Record<string, "ready" | "not_started" | "needs_attention" | "reduced_capacity" | "monitoring">
  > = {},
) {
  const ids = ["brief", "mailboxes", "sources", "suppression", "contacts", "outreach", "activity"] as const;
  return ids.map((id) => ({
    id,
    label: id,
    pillStatus: overrides[id] ?? ("ready" as const),
  }));
}

function allGreenInput(
  overrides: Partial<LaunchApprovalPolicyInput> = {},
): LaunchApprovalPolicyInput {
  return {
    clientStatus: "ONBOARDING",
    gettingStarted: makeGettingStarted({
      brief: true,
      mailboxes: true,
      suppression: true,
      contacts: true,
      templates: true,
      sequences: true,
      enrollments: true,
      launch: true,
    }),
    readinessRows: makeReadinessRows(),
    hasProductionLaunchableSequence: true,
    enrolledContactsCount: 5,
    hasSenderSignature: true,
    oneClickUnsubscribeReady: false,
    mode: "CONTROLLED_INTERNAL",
    ...overrides,
  };
}

describe("evaluateClientLaunchApproval", () => {
  it("blocks approval when the checklist is incomplete", () => {
    const result = evaluateClientLaunchApproval(
      allGreenInput({
        gettingStarted: makeGettingStarted({
          brief: false,
          mailboxes: false,
          suppression: false,
          contacts: false,
          templates: false,
          sequences: false,
          enrollments: false,
        }),
        hasProductionLaunchableSequence: false,
        enrolledContactsCount: 0,
        hasSenderSignature: false,
        readinessRows: makeReadinessRows({
          brief: "not_started",
          mailboxes: "not_started",
          suppression: "not_started",
        }),
      }),
    );
    expect(result.canApprove).toBe(false);
    expect(result.blockers.length).toBeGreaterThanOrEqual(6);
    expect(result.blockers).toContain("Business brief is not complete.");
    expect(result.blockers).toContain("No sending mailbox is connected.");
    expect(
      result.blockers.some((b) => b.includes("No launchable production sequence")),
    ).toBe(true);
    expect(result.blockers).toContain("No sequence enrollments.");
  });

  it("passes when every required item is true (controlled internal)", () => {
    const result = evaluateClientLaunchApproval(allGreenInput());
    expect(result.canApprove).toBe(true);
    expect(result.blockers).toEqual([]);
    // One-click unsubscribe is a warning under CONTROLLED_INTERNAL.
    expect(result.warnings.some((w) => /one-click unsubscribe/i.test(w))).toBe(true);
  });

  it("passes when Activity is not_started (no prior sends) if other rows are ready", () => {
    const result = evaluateClientLaunchApproval(
      allGreenInput({
        readinessRows: makeReadinessRows({ activity: "not_started" }),
      }),
    );
    expect(result.canApprove).toBe(true);
    expect(
      result.warnings.some((w) => /no outreach activity yet/i.test(w)),
    ).toBe(true);
  });

  it("does not require APPROVED template/sequence — uses production launchable flag", () => {
    const result = evaluateClientLaunchApproval(
      allGreenInput({ hasProductionLaunchableSequence: true }),
    );
    const template = result.checklist.find((c) => c.id === "template");
    const sequence = result.checklist.find((c) => c.id === "sequence");
    expect(template?.ok).toBe(true);
    expect(template?.label).toBe("Introduction ready");
    expect(sequence?.ok).toBe(true);
    expect(sequence?.label).toBe("Launchable sequence");
  });

  it("blocks when no production launchable sequence is present", () => {
    const result = evaluateClientLaunchApproval(
      allGreenInput({ hasProductionLaunchableSequence: false }),
    );
    expect(result.canApprove).toBe(false);
    expect(
      result.blockers.some((b) => b.includes("No launchable production sequence")),
    ).toBe(true);
  });

  it("blocks LIVE_PROSPECT approval while one-click unsubscribe is not wired up", () => {
    const result = evaluateClientLaunchApproval(
      allGreenInput({ mode: "LIVE_PROSPECT", oneClickUnsubscribeReady: false }),
    );
    expect(result.canApprove).toBe(false);
    expect(
      result.blockers.some((b) => /one-click unsubscribe/i.test(b)),
    ).toBe(true);
  });

  it("blocks when the client is already ACTIVE", () => {
    const result = evaluateClientLaunchApproval(
      allGreenInput({ clientStatus: "ACTIVE" }),
    );
    expect(result.canApprove).toBe(false);
    expect(result.blockers).toContain("Client is already ACTIVE.");
  });

  it("blocks when the client is ARCHIVED", () => {
    const result = evaluateClientLaunchApproval(
      allGreenInput({ clientStatus: "ARCHIVED" }),
    );
    expect(result.canApprove).toBe(false);
    expect(result.blockers).toContain("Client is ARCHIVED and cannot be launched.");
  });

  it("blocks when any non-Activity launch readiness row is needs_attention", () => {
    const result = evaluateClientLaunchApproval(
      allGreenInput({
        readinessRows: makeReadinessRows({ outreach: "needs_attention" }),
      }),
    );
    expect(result.canApprove).toBe(false);
    expect(
      result.blockers.some((b) => b.includes("Launch readiness blocker: outreach")),
    ).toBe(true);
  });

  it("does not block on Activity not_started alone (first activation)", () => {
    const result = evaluateClientLaunchApproval(
      allGreenInput({ readinessRows: makeReadinessRows({ activity: "not_started" }) }),
    );
    expect(result.canApprove).toBe(true);
    expect(result.blockers.some((b) => b.includes("Activity"))).toBe(false);
  });

  it("does not block on reduced_capacity / monitoring readiness rows", () => {
    const result = evaluateClientLaunchApproval(
      allGreenInput({
        readinessRows: makeReadinessRows({
          mailboxes: "reduced_capacity",
          activity: "monitoring",
        }),
      }),
    );
    expect(result.canApprove).toBe(true);
  });

  it("warns when suppression is attached but unsynced (controlled internal)", () => {
    const result = evaluateClientLaunchApproval(
      allGreenInput({
        readinessRows: makeReadinessRows({ suppression: "needs_attention" }),
      }),
    );
    // The needs_attention readiness row blocks, but the warning should still fire.
    expect(result.canApprove).toBe(false);
    expect(
      result.warnings.some((w) => /suppression sheet/i.test(w)),
    ).toBe(true);
  });

  it("builds a full checklist snapshot", () => {
    const result = evaluateClientLaunchApproval(allGreenInput());
    const ids = result.checklist.map((c) => c.id);
    expect(ids).toEqual([
      "brief",
      "mailbox",
      "suppression",
      "contacts",
      "template",
      "sequence",
      "enrollment",
      "sender_signature",
      "launch_readiness",
      "one_click_unsubscribe",
    ]);
  });
});

describe("isLaunchApprovalConfirmationValid", () => {
  it("accepts the exact phrase", () => {
    expect(isLaunchApprovalConfirmationValid(LAUNCH_APPROVAL_CONFIRMATION_PHRASE)).toBe(true);
  });

  it("trims surrounding whitespace", () => {
    expect(isLaunchApprovalConfirmationValid("  APPROVE LAUNCH  ")).toBe(true);
    expect(isLaunchApprovalConfirmationValid("\tAPPROVE LAUNCH\n")).toBe(true);
  });

  it("rejects wrong case", () => {
    expect(isLaunchApprovalConfirmationValid("approve launch")).toBe(false);
    expect(isLaunchApprovalConfirmationValid("Approve Launch")).toBe(false);
    expect(isLaunchApprovalConfirmationValid("APPROVE launch")).toBe(false);
  });

  it("rejects wrong phrase", () => {
    expect(isLaunchApprovalConfirmationValid("APPROVE")).toBe(false);
    expect(isLaunchApprovalConfirmationValid("APPROVE LAUNCH!")).toBe(false);
    expect(isLaunchApprovalConfirmationValid("")).toBe(false);
  });
});

describe("humanizeClientLaunchApprovalMode", () => {
  it("maps stored enums to operator-friendly labels", () => {
    expect(humanizeClientLaunchApprovalMode("CONTROLLED_INTERNAL")).toBe(
      "Controlled internal rollout",
    );
    expect(humanizeClientLaunchApprovalMode("LIVE_PROSPECT")).toBe("Live prospect sending");
    expect(humanizeClientLaunchApprovalMode(null)).toBe("—");
  });
});

describe("clientMustBeLaunchApprovedForRealProspectSend", () => {
  it("requires approval when status is ONBOARDING", () => {
    expect(
      clientMustBeLaunchApprovedForRealProspectSend({ status: "ONBOARDING" }),
    ).toBe(true);
  });

  it("does not gate ACTIVE / PAUSED / ARCHIVED clients", () => {
    expect(
      clientMustBeLaunchApprovedForRealProspectSend({ status: "ACTIVE" }),
    ).toBe(false);
    expect(
      clientMustBeLaunchApprovedForRealProspectSend({ status: "PAUSED" }),
    ).toBe(false);
    expect(
      clientMustBeLaunchApprovedForRealProspectSend({ status: "ARCHIVED" }),
    ).toBe(false);
  });
});
