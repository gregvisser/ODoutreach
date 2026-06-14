import { describe, expect, it } from "vitest";

import {
  blockedReasonForSequenceStepSend,
  evaluateSendGovernance,
  REAL_PROSPECT_SEND_GATE_COPY,
  SEND_GATE_BLOCKED_CODES,
  type SendGovernanceInput,
} from "./client-send-governance";

function baseInput(
  overrides: Partial<SendGovernanceInput> = {},
): SendGovernanceInput {
  return {
    client: {
      status: "ONBOARDING",
      launchApprovedAt: null,
      launchApprovalMode: null,
      ...(overrides.client ?? {}),
    },
    recipientAllowlisted: overrides.recipientAllowlisted ?? false,
    sendKind: overrides.sendKind ?? "SEQUENCE_INTRODUCTION",
    oneClickUnsubscribeReady: overrides.oneClickUnsubscribeReady ?? false,
  };
}

describe("evaluateSendGovernance", () => {
  describe("GOVERNED_TEST", () => {
    it("allows an allowlisted recipient regardless of client approval", () => {
      const decision = evaluateSendGovernance(
        baseInput({
          sendKind: "GOVERNED_TEST",
          recipientAllowlisted: true,
          client: {
            status: "ONBOARDING",
            launchApprovedAt: null,
            launchApprovalMode: null,
          },
        }),
      );
      expect(decision.allowed).toBe(true);
      if (decision.allowed) expect(decision.mode).toBe("allowlisted_test");
    });

    it("blocks a non-allowlisted recipient even if client is LIVE_PROSPECT-approved", () => {
      const decision = evaluateSendGovernance(
        baseInput({
          sendKind: "GOVERNED_TEST",
          recipientAllowlisted: false,
          oneClickUnsubscribeReady: true,
          client: {
            status: "ACTIVE",
            launchApprovedAt: new Date("2026-04-22T10:00:00Z"),
            launchApprovalMode: "LIVE_PROSPECT",
          },
        }),
      );
      expect(decision.allowed).toBe(false);
      if (!decision.allowed) expect(decision.mode).toBe("blocked_allowlist");
    });
  });

  describe("REPLY", () => {
    it("stays allowed regardless of launch approval state", () => {
      const decision = evaluateSendGovernance(
        baseInput({ sendKind: "REPLY", recipientAllowlisted: false }),
      );
      expect(decision.allowed).toBe(true);
      if (decision.allowed) expect(decision.mode).toBe("allowlisted_test");
    });
  });

  describe("SEQUENCE_INTRODUCTION / SEQUENCE_FOLLOW_UP", () => {
    it("allows allowlisted recipients under CONTROLLED_INTERNAL", () => {
      const decision = evaluateSendGovernance(
        baseInput({
          sendKind: "SEQUENCE_INTRODUCTION",
          recipientAllowlisted: true,
          client: {
            status: "ACTIVE",
            launchApprovedAt: new Date("2026-04-22T10:00:00Z"),
            launchApprovalMode: "CONTROLLED_INTERNAL",
          },
        }),
      );
      expect(decision.allowed).toBe(true);
      if (decision.allowed) expect(decision.mode).toBe("allowlisted_test");
    });

    it("allows allowlisted recipients on ONBOARDING clients (legacy/pilot)", () => {
      const decision = evaluateSendGovernance(
        baseInput({
          sendKind: "SEQUENCE_FOLLOW_UP",
          recipientAllowlisted: true,
        }),
      );
      expect(decision.allowed).toBe(true);
      if (decision.allowed) expect(decision.mode).toBe("allowlisted_test");
    });

    it("blocks non-allowlisted recipients when client is ONBOARDING", () => {
      const decision = evaluateSendGovernance(
        baseInput({
          sendKind: "SEQUENCE_INTRODUCTION",
          recipientAllowlisted: false,
          client: {
            status: "ONBOARDING",
            launchApprovedAt: null,
            launchApprovalMode: null,
          },
        }),
      );
      expect(decision.allowed).toBe(false);
      if (!decision.allowed) {
        expect(decision.mode).toBe("blocked_client_inactive");
        expect(decision.reason).toMatch(/not ACTIVE/);
      }
    });

    it("allows non-allowlisted recipients when client is ACTIVE (CONTROLLED_INTERNAL)", () => {
      const decision = evaluateSendGovernance(
        baseInput({
          sendKind: "SEQUENCE_INTRODUCTION",
          recipientAllowlisted: false,
          oneClickUnsubscribeReady: true,
          client: {
            status: "ACTIVE",
            launchApprovedAt: new Date("2026-04-22T10:00:00Z"),
            launchApprovalMode: "CONTROLLED_INTERNAL",
          },
        }),
      );
      expect(decision.allowed).toBe(true);
      if (decision.allowed) expect(decision.mode).toBe("live_prospect");
    });

    it("allows non-allowlisted follow-up recipients when client is ACTIVE", () => {
      const decision = evaluateSendGovernance(
        baseInput({
          sendKind: "SEQUENCE_FOLLOW_UP",
          recipientAllowlisted: false,
          oneClickUnsubscribeReady: true,
          client: {
            status: "ACTIVE",
            launchApprovedAt: null,
            launchApprovalMode: null,
          },
        }),
      );
      expect(decision.allowed).toBe(true);
      if (decision.allowed) expect(decision.mode).toBe("live_prospect");
    });

    it("does not require LIVE_PROSPECT mode for sequence sends", () => {
      const decision = evaluateSendGovernance(
        baseInput({
          sendKind: "SEQUENCE_INTRODUCTION",
          recipientAllowlisted: false,
          oneClickUnsubscribeReady: true,
          client: {
            status: "ACTIVE",
            launchApprovedAt: new Date("2026-04-22T10:00:00Z"),
            launchApprovalMode: "CONTROLLED_INTERNAL",
          },
        }),
      );
      expect(decision.allowed).toBe(true);
      if (decision.allowed) expect(decision.mode).toBe("live_prospect");
    });

    it("BLOCKS a non-allowlisted sequence send when one-click unsubscribe is not ready", () => {
      const decision = evaluateSendGovernance(
        baseInput({
          sendKind: "SEQUENCE_INTRODUCTION",
          recipientAllowlisted: false,
          oneClickUnsubscribeReady: false,
          client: {
            status: "ACTIVE",
            launchApprovedAt: new Date("2026-04-22T10:00:00Z"),
            launchApprovalMode: "LIVE_PROSPECT",
          },
        }),
      );
      // Compliance: a real prospect must get a working opt-out. If the
      // hosted unsubscribe rail isn't wired we block rather than email a
      // dead link.
      expect(decision.allowed).toBe(false);
      if (!decision.allowed) {
        expect(decision.mode).toBe("blocked_unsubscribe_missing");
      }
    });

    it("allows a non-allowlisted sequence send once one-click unsubscribe is ready", () => {
      const decision = evaluateSendGovernance(
        baseInput({
          sendKind: "SEQUENCE_FOLLOW_UP",
          recipientAllowlisted: false,
          oneClickUnsubscribeReady: true,
          client: {
            status: "ACTIVE",
            launchApprovedAt: null,
            launchApprovalMode: null,
          },
        }),
      );
      expect(decision.allowed).toBe(true);
      if (decision.allowed) expect(decision.mode).toBe("live_prospect");
    });
  });

  describe("CONTROLLED_PILOT", () => {
    it("allows allowlisted recipients", () => {
      const allowed = evaluateSendGovernance(
        baseInput({
          sendKind: "CONTROLLED_PILOT",
          recipientAllowlisted: true,
        }),
      );
      expect(allowed.allowed).toBe(true);
    });

    it("blocks non-allowlisted recipients on ONBOARDING clients", () => {
      const blocked = evaluateSendGovernance(
        baseInput({
          sendKind: "CONTROLLED_PILOT",
          recipientAllowlisted: false,
        }),
      );
      expect(blocked.allowed).toBe(false);
    });

    it("retains strict gates: blocks CONTROLLED_INTERNAL non-allowlisted", () => {
      const decision = evaluateSendGovernance(
        baseInput({
          sendKind: "CONTROLLED_PILOT",
          recipientAllowlisted: false,
          client: {
            status: "ACTIVE",
            launchApprovedAt: new Date("2026-04-22T10:00:00Z"),
            launchApprovalMode: "CONTROLLED_INTERNAL",
          },
        }),
      );
      expect(decision.allowed).toBe(false);
      if (!decision.allowed) expect(decision.mode).toBe("blocked_not_live_mode");
    });

    it("retains strict gates: blocks LIVE_PROSPECT without unsubscribe", () => {
      const decision = evaluateSendGovernance(
        baseInput({
          sendKind: "CONTROLLED_PILOT",
          recipientAllowlisted: false,
          oneClickUnsubscribeReady: false,
          client: {
            status: "ACTIVE",
            launchApprovedAt: new Date("2026-04-22T10:00:00Z"),
            launchApprovalMode: "LIVE_PROSPECT",
          },
        }),
      );
      expect(decision.allowed).toBe(false);
      if (!decision.allowed) expect(decision.mode).toBe("blocked_unsubscribe_missing");
    });

    it("allows LIVE_PROSPECT + unsubscribe ready", () => {
      const decision = evaluateSendGovernance(
        baseInput({
          sendKind: "CONTROLLED_PILOT",
          recipientAllowlisted: false,
          oneClickUnsubscribeReady: true,
          client: {
            status: "ACTIVE",
            launchApprovedAt: new Date("2026-04-22T10:00:00Z"),
            launchApprovalMode: "LIVE_PROSPECT",
          },
        }),
      );
      expect(decision.allowed).toBe(true);
      if (decision.allowed) expect(decision.mode).toBe("live_prospect");
    });
  });

  describe("blockedReasonForSequenceStepSend", () => {
    it("prefixes the blocked code and includes the canonical gate copy", () => {
      const decision = evaluateSendGovernance(
        baseInput({
          sendKind: "CONTROLLED_PILOT",
          recipientAllowlisted: false,
        }),
      );
      if (decision.allowed) throw new Error("expected blocked");
      const reason = blockedReasonForSequenceStepSend(decision);
      expect(reason).toContain(`[${SEND_GATE_BLOCKED_CODES.clientInactive}]`);
      expect(reason).toContain(REAL_PROSPECT_SEND_GATE_COPY);
    });
  });
});
