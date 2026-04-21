/**
 * Pure dispatch-time policy for the sequence introduction send
 * (PR D4e.2).
 *
 * The planner (D4e.1) produces `ClientEmailSequenceStepSend` rows
 * with status `READY`, and the Outreach UI triggers the dispatcher.
 * This helper is the single source of truth for "may this row be
 * sent RIGHT NOW?". It runs AFTER the plan-time classifier
 * (`classifySequenceStepSendCandidate`) so we still get every
 * tenant/structural guard, and layers on the D4e.2-only checks:
 *
 *   * Introduction step only.
 *   * Recipient domain passes `isRecipientAllowedForGovernedTest`.
 *   * Stored plan row is still READY, not SENT/FAILED/BLOCKED.
 *   * No OutboundEmail is already linked (no double-send).
 *
 * No I/O, no Prisma, no clock. The server helper feeds this
 * everything it loaded (step-send row + classified candidate +
 * environment knobs). Mailbox capacity / reservation conflicts
 * stay inside the existing transactional ledger helpers — adding
 * them here would duplicate the truth in two places.
 */

import type {
  ClientEmailSequenceStepSendStatus,
  ClientEmailTemplateCategory,
} from "@/generated/prisma/enums";

import {
  classifySequenceStepSendCandidate,
  type SequenceStepSendCandidate,
  type SequenceStepSendClassification,
} from "./sequence-send-policy";

export type SequenceIntroSendExecutionReason =
  /** Plan-time classifier passed AND D4e.2-only guards passed. */
  | "sendable"
  | "blocked_not_introduction_step"
  | "blocked_not_ready"
  | "blocked_already_sent"
  | "blocked_already_linked_outbound"
  | "blocked_allowlist_not_configured"
  | "blocked_allowlist_domain"
  | "blocked_plan_classifier";

export type SequenceIntroSendExecutionDecision =
  | {
      sendable: true;
      reason: "sendable";
      /** Plan-time classification (always READY when sendable). */
      classification: SequenceStepSendClassification;
      /** Lowercased domain that passed the allowlist. */
      allowlistedDomain: string;
    }
  | {
      sendable: false;
      reason: Exclude<SequenceIntroSendExecutionReason, "sendable">;
      detail: string;
      /**
       * Classification is populated whenever we got far enough to run
       * the plan-time classifier; it is `null` for early guards that
       * trip before we build a candidate (e.g. wrong step category).
       */
      classification: SequenceStepSendClassification | null;
    };

export type SequenceIntroSendExecutionInput = {
  /** Projection of the persisted `ClientEmailSequenceStepSend` row. */
  stepSend: {
    id: string;
    status: ClientEmailSequenceStepSendStatus;
    outboundEmailId: string | null;
  };
  /** Projection of the owning step so we can enforce INTRODUCTION. */
  stepCategory: ClientEmailTemplateCategory;
  /** Rebuilt candidate for the plan-time classifier. */
  candidate: SequenceStepSendCandidate;
  /**
   * Environment allowlist state at the moment of dispatch. The server
   * helper reads `process.env.GOVERNED_TEST_EMAIL_DOMAINS` (via
   * `allowedGovernedTestEmailDomains`) and forwards the resolved list
   * here so the policy stays pure. An empty list is still "configured"
   * from the env-variable perspective, but we refuse to send with an
   * empty list to match the D4e.2 safety rule.
   */
  allowlist: {
    /** `true` when `GOVERNED_TEST_EMAIL_DOMAINS` was explicitly set. */
    configured: boolean;
    /** Lowercased allowed domains (already trimmed / de-duplicated). */
    domains: readonly string[];
  };
};

function normaliseDomain(email: string | null | undefined): string | null {
  if (typeof email !== "string") return null;
  const at = email.lastIndexOf("@");
  if (at < 0 || at === email.length - 1) return null;
  const dom = email.slice(at + 1).trim().toLowerCase();
  return dom.length > 0 ? dom : null;
}

/**
 * Pure recipient-allowlist check. Kept tiny so the UI and policy
 * tests can import without pulling server-only code paths.
 */
export function isRecipientDomainAllowedForSequenceIntroSend(
  email: string | null | undefined,
  allowlist: { configured: boolean; domains: readonly string[] },
): { allowed: boolean; domain: string | null; reason: "configured_ok" | "domain_blocked" | "allowlist_empty" | "not_configured" | "invalid_email" } {
  if (!allowlist.configured) {
    return { allowed: false, domain: null, reason: "not_configured" };
  }
  if (allowlist.domains.length === 0) {
    return { allowed: false, domain: null, reason: "allowlist_empty" };
  }
  const dom = normaliseDomain(email);
  if (!dom) {
    return { allowed: false, domain: null, reason: "invalid_email" };
  }
  if (!allowlist.domains.includes(dom)) {
    return { allowed: false, domain: dom, reason: "domain_blocked" };
  }
  return { allowed: true, domain: dom, reason: "configured_ok" };
}

/** Dispatch-time decision for exactly one step-send row. */
export function classifySequenceIntroSendExecution(
  input: SequenceIntroSendExecutionInput,
): SequenceIntroSendExecutionDecision {
  // 0. Structural guard — only INTRODUCTION.
  if (input.stepCategory !== "INTRODUCTION") {
    return {
      sendable: false,
      reason: "blocked_not_introduction_step",
      detail: `Only INTRODUCTION steps may be sent by D4e.2 (this step is ${input.stepCategory}).`,
      classification: null,
    };
  }

  // 1. Idempotency — refuse to re-dispatch a row that already ran.
  if (input.stepSend.status === "SENT") {
    return {
      sendable: false,
      reason: "blocked_already_sent",
      detail: "Step send is already SENT — refusing to re-dispatch.",
      classification: null,
    };
  }
  if (input.stepSend.outboundEmailId) {
    return {
      sendable: false,
      reason: "blocked_already_linked_outbound",
      detail:
        "Step send is already linked to an OutboundEmail — refusing to re-dispatch.",
      classification: null,
    };
  }

  // 2. Re-run the plan-time classifier. Never trust stored READY.
  const classification = classifySequenceStepSendCandidate(input.candidate);
  if (classification.status !== "READY") {
    return {
      sendable: false,
      reason: "blocked_plan_classifier",
      detail:
        classification.reasonDetail ??
        `Plan-time classifier returned ${classification.status} (${classification.reason}).`,
      classification,
    };
  }

  // 3. Stored status must also be READY. A row that was BLOCKED /
  //    SUPPRESSED / SKIPPED at plan-time requires operator action
  //    (re-plan) before it can be sent.
  if (input.stepSend.status !== "READY") {
    return {
      sendable: false,
      reason: "blocked_not_ready",
      detail: `Stored step-send status is ${input.stepSend.status}, not READY.`,
      classification,
    };
  }

  // 4. Allowlist — hard gate for pilot/governed-test phase.
  if (!input.allowlist.configured) {
    return {
      sendable: false,
      reason: "blocked_allowlist_not_configured",
      detail:
        "GOVERNED_TEST_EMAIL_DOMAINS is not configured — refusing to send sequence introductions.",
      classification,
    };
  }
  const allow = isRecipientDomainAllowedForSequenceIntroSend(
    input.candidate.contact.email,
    input.allowlist,
  );
  if (!allow.allowed) {
    const domainLabel = allow.domain ?? "(no domain)";
    const detail =
      allow.reason === "allowlist_empty"
        ? "GOVERNED_TEST_EMAIL_DOMAINS resolved to an empty allowlist."
        : allow.reason === "invalid_email"
          ? "Contact email has no valid domain — cannot evaluate allowlist."
          : `Recipient domain ${domainLabel} is not in GOVERNED_TEST_EMAIL_DOMAINS.`;
    return {
      sendable: false,
      reason: "blocked_allowlist_domain",
      detail,
      classification,
    };
  }

  return {
    sendable: true,
    reason: "sendable",
    classification,
    allowlistedDomain: allow.domain ?? "",
  };
}

export type SequenceIntroSendPlanCounts = {
  total: number;
  sendable: number;
  blockedAllowlist: number;
  blockedNotReady: number;
  blockedAlreadySent: number;
  blockedNotIntroduction: number;
  blockedPlanClassifier: number;
};

export function zeroSequenceIntroSendPlanCounts(): SequenceIntroSendPlanCounts {
  return {
    total: 0,
    sendable: 0,
    blockedAllowlist: 0,
    blockedNotReady: 0,
    blockedAlreadySent: 0,
    blockedNotIntroduction: 0,
    blockedPlanClassifier: 0,
  };
}

export function incrementSequenceIntroSendPlanCounts(
  counts: SequenceIntroSendPlanCounts,
  decision: SequenceIntroSendExecutionDecision,
): SequenceIntroSendPlanCounts {
  const next: SequenceIntroSendPlanCounts = {
    ...counts,
    total: counts.total + 1,
  };
  if (decision.sendable) {
    next.sendable += 1;
    return next;
  }
  switch (decision.reason) {
    case "blocked_allowlist_not_configured":
    case "blocked_allowlist_domain":
      next.blockedAllowlist += 1;
      return next;
    case "blocked_not_ready":
      next.blockedNotReady += 1;
      return next;
    case "blocked_already_sent":
    case "blocked_already_linked_outbound":
      next.blockedAlreadySent += 1;
      return next;
    case "blocked_not_introduction_step":
      next.blockedNotIntroduction += 1;
      return next;
    case "blocked_plan_classifier":
      next.blockedPlanClassifier += 1;
      return next;
    default: {
      return next;
    }
  }
}
