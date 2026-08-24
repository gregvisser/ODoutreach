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
 *     (real prospect) recipients require client.status === ACTIVE AND a
 *     working one-click unsubscribe (`oneClickUnsubscribeReady`) — we must
 *     never email a real prospect an opt-out they can't use, so if no
 *     hosted unsubscribe URL can be generated the send is blocked rather
 *     than silently degraded to a dead mailto. No LIVE_PROSPECT-mode gate.
 *     Suppression, mailbox capacity, batch caps and the typed confirmation
 *     phrase remain enforced by the dispatcher.
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
  | "blocked_link_domain_not_aligned"
  | "blocked_signature_link_misaligned"
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
   * `true` when the send has a working opt-out rail. Either:
   *
   *   * **hosted** — the client has a verified sender-aligned link domain
   *     (`go.<client-domain>`), so a redeemable unsubscribe link and RFC 8058
   *     one-click header can be minted on their OWN domain; or
   *   * **mailto** — a sending mailbox that can receive an opt-out reply.
   *     Replies are ingested by the reply sync and suppressed automatically by
   *     `classifyOptOutReply`.
   *
   * When `false`, real-prospect sequence sends AND controlled-pilot sends are
   * blocked so no recipient is emailed an unusable opt-out.
   *
   * Widened 2026-08 from "is a public base URL configured?". That older check
   * was satisfied by the OpensDoors app domain, which is precisely the link
   * misalignment that caused the quarantine incident — so it reported ready
   * while the only available link was the harmful one. A monitored mailto is a
   * genuinely usable opt-out; no rail at all still blocks exactly as before.
   */
  oneClickUnsubscribeReady: boolean;
  /**
   * `false` blocks a real-prospect send under the aligned-link-domain hard rule
   * (OUTREACH_REQUIRE_ALIGNED_LINK_DOMAIN): the client's unsubscribe + tracking
   * links must be on a domain that aligns with the sender (`go.<client-domain>`),
   * otherwise the email reads as phishing and is quarantined. Callers pass
   * `clientLinkDomainAligned(client)`. Optional — when omitted it is treated as
   * aligned (the rule is off), so existing callers are unaffected.
   */
  linkDomainAligned?: boolean;
  /**
   * `true` when the CONTENT this send will carry — the mailbox signature, and
   * anything woven into it — contains a link on the OpensDoors platform's own
   * domain.
   *
   * The gate above (`linkDomainAligned`) is computed from two DATABASE COLUMNS
   * describing the client's configured link domain. It never reads the message.
   * So a signature could carry `https://opensdoors.bidlow.co.uk/...` straight to
   * a prospect and every existing check would pass — the send gate has never
   * looked at signature content. `scripts/ops-cross-domain-audit.ts` detects
   * exactly this and has no production caller, which is the same defect class as
   * PR #194: detector written, caller never built.
   *
   * Deliberately a BOOLEAN, not the findings. This helper is pure — no Prisma,
   * no environment reads — so the caller resolves the content and classifies it
   * with `@/lib/clients/signature-link-alignment`, and passes the verdict in.
   *
   * Optional, defaulting to "no blocking finding", so existing callers are
   * unaffected until they opt in.
   */
  signatureLinkMisaligned?: boolean;
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
  linkDomainNotAligned: "blocked_link_domain_not_aligned",
  signatureLinkMisaligned: "blocked_signature_link_misaligned",
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
    case "blocked_link_domain_not_aligned":
      return SEND_GATE_BLOCKED_CODES.linkDomainNotAligned;
    case "blocked_signature_link_misaligned":
      return SEND_GATE_BLOCKED_CODES.signatureLinkMisaligned;
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

  // Hard rule (OUTREACH_REQUIRE_ALIGNED_LINK_DOMAIN): a real-prospect outreach
  // email must carry its unsubscribe + tracking links on a domain that ALIGNS
  // with the sender (go.<client-domain>). Cross-domain links read as phishing
  // and get quarantined, harming the customer's own domain reputation.
  // Allowlisted / governed-test / reply sends already returned above, so this
  // only ever gates real prospects — internal testing is never blocked.
  if (input.linkDomainAligned === false) {
    return {
      allowed: false,
      mode: "blocked_link_domain_not_aligned",
      reason:
        "Blocked: this client's outreach links are not on a sender-aligned domain (go.<domain>). Set up and verify the client's link domain before sending to real prospects.",
    };
  }

  // Signature content gate. A remote IMAGE on a third-party host does NOT reach
  // here — measured on production 2026-08-24, blocking on that would have
  // stopped the largest client for hosting its own logo on its own website's
  // CDN. Only the platform's own domain inside a customer's email blocks, which
  // is the exact pattern that caused the 2026 quarantine.
  if (input.signatureLinkMisaligned === true) {
    return {
      allowed: false,
      mode: "blocked_signature_link_misaligned",
      reason:
        "Blocked: this mailbox's signature contains a link to the OpensDoors system's own address rather than the client's. Recipients would see a link that does not match who the email is from. Remove it from the signature before sending.",
    };
  }

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
    // Compliance gate: a real-prospect outreach email MUST carry a working
    // one-click unsubscribe. If the hosted unsubscribe rail isn't wired
    // (public base URL unset → the dispatcher would fall back to a dead
    // mailto with no redeemable token), block rather than send. In a
    // correctly configured environment this is always ready, so this never
    // fires in normal operation — it only catches a misconfiguration.
    if (!oneClickUnsubscribeReady) {
      return {
        allowed: false,
        mode: "blocked_unsubscribe_missing",
        reason:
          "No working one-click unsubscribe could be generated (public base URL not configured) — a real-prospect send is blocked so we never email a dead opt-out link.",
      };
    }
    return {
      allowed: true,
      mode: "live_prospect",
      reason:
        "Client is ACTIVE and a working unsubscribe is wired — live sequence sends proceed with dispatcher safety checks.",
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
