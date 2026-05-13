/**
 * Client send governance.
 *
 * Pure helper that decides whether a single outbound send may proceed
 * given the client's current approval state, the recipient's allowlist
 * status, and the kind of send being attempted.
 *
 * No Prisma, no React, no environment reads — everything is passed in.
 * This lets the sequence dispatcher, UI snapshot loaders and unit
 * tests reach the same decision from the same inputs.
 *
 * Policy:
 *
 *   * GOVERNED_TEST / REPLY — unchanged. GOVERNED_TEST requires an
 *     allowlisted recipient; REPLY is always allowed.
 *   * SEQUENCE_INTRODUCTION / SEQUENCE_FOLLOW_UP — live outreach path.
 *     Allowlisted recipients pass as `allowlisted_test`. Non-allowlisted
 *     recipients require client.status === ACTIVE; no hidden
 *     LIVE_PROSPECT mode or one-click unsubscribe gate. Suppression,
 *     mailbox capacity, batch caps and the typed confirmation phrase
 *     remain enforced by the dispatcher.
 *   * CONTROLLED_PILOT — retains strict gates: ACTIVE + approved +
 *     LIVE_PROSPECT mode + one-click unsubscribe. This preserves pilot
 *     safety while live sequence sends operate freely.
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
  "Blocked from live sending — check client status and dispatch requirements.";

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
 * Decide whether a single send may proceed under governance.
 *
 * Allowlisted recipients on any send kind (except GOVERNED_TEST
 * without an allowlisted address) pass as `allowlisted_test`.
 *
 * Non-allowlisted recipients:
 *   * SEQUENCE_INTRODUCTION / SEQUENCE_FOLLOW_UP — require only
 *     client.status === ACTIVE. Suppression, mailbox capacity, batch
 *     caps and the typed confirmation phrase enforce safety.
 *   * CONTROLLED_PILOT — retains strict ACTIVE + approved +
 *     LIVE_PROSPECT + one-click unsubscribe gates.
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
  // approval; suppression + mailbox readiness apply in their own helpers.
  if (sendKind === "REPLY") {
    return {
      allowed: true,
      mode: "allowlisted_test",
      reason:
        "Reply path is operator-driven and not gated by launch approval.",
    };
  }

  // Allowlisted recipients pass on any remaining send kind.
  if (recipientAllowlisted) {
    return {
      allowed: true,
      mode: "allowlisted_test",
      reason:
        "Recipient is on the governed-test allowlist — allowed under CONTROLLED_INTERNAL.",
    };
  }

  // --- Non-allowlisted recipients below this line. ---

  // Live sequence sends: ACTIVE client status is the only governance
  // requirement. The confirmation phrase, suppression, mailbox capacity
  // and batch caps enforce safety at dispatch time.
  if (
    sendKind === "SEQUENCE_INTRODUCTION" ||
    sendKind === "SEQUENCE_FOLLOW_UP"
  ) {
    if (status !== "ACTIVE") {
      return {
        allowed: false,
        mode: "blocked_client_inactive",
        reason: `Client is ${status}, not ACTIVE — activate the client before launching live sequences.`,
      };
    }
    return {
      allowed: true,
      mode: "live_prospect",
      reason:
        "Client is ACTIVE — live sequence sends proceed with dispatcher safety checks.",
    };
  }

  // CONTROLLED_PILOT — strict gates preserved for pilot safety.
  if (status !== "ACTIVE") {
    return {
      allowed: false,
      mode: "blocked_client_inactive",
      reason: `Client is ${status}, not ACTIVE — controlled pilot requires an active client.`,
    };
  }

  if (!approved) {
    return {
      allowed: false,
      mode: "blocked_not_approved",
      reason:
        "Client has no recorded launch approval — controlled pilot sends are blocked.",
    };
  }

  if (mode !== "LIVE_PROSPECT") {
    return {
      allowed: false,
      mode: "blocked_not_live_mode",
      reason:
        "Client launch approval is not LIVE_PROSPECT — controlled pilot requires LIVE_PROSPECT mode.",
    };
  }

  if (!oneClickUnsubscribeReady) {
    return {
      allowed: false,
      mode: "blocked_unsubscribe_missing",
      reason:
        "One-click unsubscribe is not wired — controlled pilot sends are blocked until it is implemented.",
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
