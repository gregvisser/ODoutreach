/**
 * PR L — Client send governance (real-prospect launch-approval gate).
 *
 * Pure helper that decides whether a single outbound send may proceed
 * given the client's current approval state, the recipient's allowlist
 * status, and the kind of send being attempted.
 *
 * No Prisma, no React, no environment reads — everything is passed in.
 * This lets the sequence dispatcher, UI snapshot loaders and unit
 * tests reach the same decision from the same inputs.
 *
 * Policy intent (PR L):
 *
 *   * GOVERNED_TEST / REPLY paths remain unaffected. They are
 *     operator-driven proof / manual reply paths; we document and
 *     return an explicit `allowlisted_test` mode for them.
 *   * SEQUENCE_INTRODUCTION / SEQUENCE_FOLLOW_UP / CONTROLLED_PILOT:
 *     - allowlisted recipients — always allowed (existing D4e
 *       governed-test allowlist path). Mode: `allowlisted_test`.
 *     - non-allowlisted recipients — require:
 *         * client.status === ACTIVE
 *         * client.launchApprovedAt present
 *         * client.launchApprovalMode === LIVE_PROSPECT
 *         * one-click unsubscribe readiness = true
 *       If any of those fail, the send is blocked with a specific
 *       reason code the server helper can persist on the step-send
 *       row and surface in the UI. Because one-click unsubscribe is
 *       not implemented yet, real prospect sequence sends remain
 *       blocked end-to-end until a future PR wires it up.
 *
 * This helper never opens real-prospect sending on its own. A caller
 * would have to supply `oneClickUnsubscribeReady: true` AND a client
 * with LIVE_PROSPECT approval + ACTIVE status for the `live_prospect`
 * mode to return `allowed: true`. None of that is wired today.
 */
import type { ClientLifecycleStatus } from "@/generated/prisma/enums";

import type { ClientLaunchApprovalMode } from "@/lib/clients/client-launch-approval";

/** High-level categorisation of the outbound attempt being governed. */
export type SendKind =
  | "GOVERNED_TEST"
  | "CONTROLLED_PILOT"
  | "SEQUENCE_INTRODUCTION"
  | "SEQUENCE_FOLLOW_UP"
  | "REPLY";

/** Machine-readable outcome tag used for persistence and UI copy. */
export type SendGovernanceMode =
  | "allowlisted_test"
  | "live_prospect"
  | "blocked_not_approved"
  | "blocked_not_live_mode"
  | "blocked_unsubscribe_missing"
  | "blocked_client_inactive"
  | "blocked_allowlist";

export type SendGovernanceDecision =
  | {
      allowed: true;
      mode: Extract<SendGovernanceMode, "allowlisted_test" | "live_prospect">;
      reason: string;
    }
  | {
      allowed: false;
      mode: Exclude<
        SendGovernanceMode,
        "allowlisted_test" | "live_prospect"
      >;
      reason: string;
    };

export type SendGovernanceInput = {
  client: {
    status: ClientLifecycleStatus | string;
    launchApprovedAt: Date | string | null;
    launchApprovalMode: ClientLaunchApprovalMode | string | null;
  };
  /** Whether the recipient's email domain is on the governed-test allowlist. */
  recipientAllowlisted: boolean;
  sendKind: SendKind;
  /**
   * `true` only when one-click unsubscribe is wired end-to-end for
   * this client (per-message List-Unsubscribe header + handler). Until
   * a future PR wires this up, every caller in production passes
   * `false`, which means every non-allowlisted send stays blocked.
   */
  oneClickUnsubscribeReady: boolean;
};

/**
 * Canonical copy shown to operators when a non-allowlisted real
 * prospect send is blocked by this helper. Exported so the UI panel
 * and action flashes can render the exact same wording as the
 * server-side block reason.
 */
export const REAL_PROSPECT_SEND_GATE_COPY =
  "Blocked from live sending until client is approved for LIVE_PROSPECT and one-click unsubscribe is configured.";

/**
 * Short-form blocker codes persisted on `ClientEmailSequenceStepSend.blockedReason`
 * when this helper blocks a row. Prefixing the reason with a stable
 * code lets the outreach timeline render an accurate label even when
 * the free-text reason changes.
 */
export const SEND_GATE_BLOCKED_CODES = {
  launchApprovalRequired: "blocked_launch_approval_required",
  liveModeNotEnabled: "blocked_live_mode_not_enabled",
  unsubscribeRequired: "blocked_unsubscribe_required",
  clientInactive: "blocked_client_inactive",
  allowlist: "blocked_allowlist",
} as const;

export type SendGateBlockedCode =
  (typeof SEND_GATE_BLOCKED_CODES)[keyof typeof SEND_GATE_BLOCKED_CODES];

/** Map a blocked governance mode to the stable short-form code. */
export function blockedCodeFor(
  mode: Exclude<SendGovernanceMode, "allowlisted_test" | "live_prospect">,
): SendGateBlockedCode {
  switch (mode) {
    case "blocked_not_approved":
      return SEND_GATE_BLOCKED_CODES.launchApprovalRequired;
    case "blocked_not_live_mode":
      return SEND_GATE_BLOCKED_CODES.liveModeNotEnabled;
    case "blocked_unsubscribe_missing":
      return SEND_GATE_BLOCKED_CODES.unsubscribeRequired;
    case "blocked_client_inactive":
      return SEND_GATE_BLOCKED_CODES.clientInactive;
    case "blocked_allowlist":
      return SEND_GATE_BLOCKED_CODES.allowlist;
  }
}

function hasLaunchApproval(input: SendGovernanceInput["client"]): boolean {
  if (input.launchApprovedAt === null || input.launchApprovedAt === undefined) {
    return false;
  }
  if (input.launchApprovedAt instanceof Date) {
    return !Number.isNaN(input.launchApprovedAt.getTime());
  }
  if (typeof input.launchApprovedAt === "string") {
    return input.launchApprovedAt.trim().length > 0;
  }
  return false;
}

/**
 * Decide whether a single send may proceed under PR L governance.
 *
 * The helper is intentionally shape-preserving — allowlisted sequence
 * sends continue to pass today exactly as they did before PR L, but
 * every non-allowlisted attempt now carries a specific, auditable
 * blocker code.
 */
export function evaluateSendGovernance(
  input: SendGovernanceInput,
): SendGovernanceDecision {
  const { client, recipientAllowlisted, sendKind, oneClickUnsubscribeReady } =
    input;
  const status = String(client.status);
  const mode =
    client.launchApprovalMode === null ||
    client.launchApprovalMode === undefined
      ? null
      : String(client.launchApprovalMode);
  const approved = hasLaunchApproval(client);

  // GOVERNED_TEST — internal proof path. Stays available regardless of
  // the client's launch state, but the recipient must be allowlisted.
  if (sendKind === "GOVERNED_TEST") {
    if (!recipientAllowlisted) {
      return {
        allowed: false,
        mode: "blocked_allowlist",
        reason:
          "Governed test requires an allowlisted recipient (GOVERNED_TEST_EMAIL_DOMAINS).",
      };
    }
    return {
      allowed: true,
      mode: "allowlisted_test",
      reason:
        "Governed test send to an allowlisted recipient — internal proof only.",
    };
  }

  // REPLY — operator-driven reply path. Not governed by launch
  // approval today; suppression + mailbox readiness continue to apply
  // in their own helpers.
  if (sendKind === "REPLY") {
    return {
      allowed: true,
      mode: "allowlisted_test",
      reason:
        "Reply path is operator-driven and not gated by launch approval.",
    };
  }

  // Sequence and controlled-pilot sends share the real-prospect gate.
  if (recipientAllowlisted) {
    return {
      allowed: true,
      mode: "allowlisted_test",
      reason:
        "Recipient is on the governed-test allowlist — allowed under CONTROLLED_INTERNAL.",
    };
  }

  if (status !== "ACTIVE") {
    return {
      allowed: false,
      mode: "blocked_client_inactive",
      reason: `Client is ${status}, not ACTIVE — real prospect sends require launch approval.`,
    };
  }

  if (!approved) {
    return {
      allowed: false,
      mode: "blocked_not_approved",
      reason:
        "Client has no recorded launch approval — real prospect sends are blocked.",
    };
  }

  if (mode !== "LIVE_PROSPECT") {
    return {
      allowed: false,
      mode: "blocked_not_live_mode",
      reason:
        "Client launch approval is not LIVE_PROSPECT — only allowlisted sends are allowed.",
    };
  }

  if (!oneClickUnsubscribeReady) {
    return {
      allowed: false,
      mode: "blocked_unsubscribe_missing",
      reason:
        "One-click unsubscribe is not wired — real prospect sends are blocked until it is implemented.",
    };
  }

  return {
    allowed: true,
    mode: "live_prospect",
    reason:
      "Client is approved for LIVE_PROSPECT and one-click unsubscribe is wired.",
  };
}

/**
 * Build the persisted `blockedReason` string for a blocked governance
 * decision. Prefixes the short-form code so the outreach timeline can
 * group rows by blocker without parsing free-text, then appends the
 * canonical operator-facing copy for clarity in the UI.
 */
export function blockedReasonForSequenceStepSend(
  decision: Extract<SendGovernanceDecision, { allowed: false }>,
): string {
  const code = blockedCodeFor(decision.mode);
  return `[${code}] ${decision.reason} ${REAL_PROSPECT_SEND_GATE_COPY}`.trim();
}
