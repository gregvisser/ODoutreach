/**
 * Pure dispatch-time policy for sequence step sends (PR D4e.2 + D4e.3).
 *
 * The planner (D4e.1) produces `ClientEmailSequenceStepSend` rows
 * with status `READY`, and the Outreach UI triggers the dispatcher.
 * This helper is the single source of truth for "may this row be
 * sent RIGHT NOW?". It runs AFTER the plan-time classifier
 * (`classifySequenceStepSendCandidate`) so we still get every
 * tenant/structural guard, and layers on the dispatch-time checks:
 *
 *   * Only the requested `category` may be sent.
 *   * For FOLLOW_UP_N categories: the previous category must have a
 *     SENT `ClientEmailSequenceStepSend` on the same enrollment AND
 *     `delayDays` must have elapsed since that SENT timestamp.
 *   * Recipient domain passes `GOVERNED_TEST_EMAIL_DOMAINS`.
 *   * Stored plan row is still READY, not SENT/FAILED/BLOCKED.
 *   * No OutboundEmail is already linked (no double-send).
 *
 * No I/O, no Prisma, no clock. The server helper feeds this
 * everything it loaded (step-send row + classified candidate +
 * previous-step projection + environment knobs + `nowIso`). Mailbox
 * capacity / reservation conflicts stay inside the existing
 * transactional ledger helpers — adding them here would duplicate
 * the truth in two places.
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

// ---------------------------------------------------------------------------
// Legacy INTRODUCTION-only decision surface (D4e.2).
//
// Kept as-is for back-compat with the D4e.2 call sites and tests.
// Internally this is now a thin wrapper over `classifySequenceStepSend
// Execution({ category: "INTRODUCTION", ... })`.
// ---------------------------------------------------------------------------

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

/**
 * @deprecated Use `isRecipientDomainAllowedForSequenceStepSend`.
 * Retained as an alias for D4e.2 call sites and tests.
 */
export const isRecipientDomainAllowedForSequenceStepSend =
  isRecipientDomainAllowedForSequenceIntroSend;

/**
 * Dispatch-time decision for exactly one INTRODUCTION step-send row.
 * Thin wrapper over the generic `classifySequenceStepSendExecution`
 * that preserves the D4e.2 decision shape.
 */
export function classifySequenceIntroSendExecution(
  input: SequenceIntroSendExecutionInput,
): SequenceIntroSendExecutionDecision {
  const generic = classifySequenceStepSendExecution({
    category: "INTRODUCTION",
    stepSend: input.stepSend,
    stepCategory: input.stepCategory,
    candidate: input.candidate,
    allowlist: input.allowlist,
    // INTRODUCTION has no previous-step / delay guard.
    previousStepSend: null,
    delayDays: 0,
    delayHours: 0,
    skipDomainAllowlist: false,
    nowIso: new Date(0).toISOString(),
  });

  if (generic.sendable) {
    return {
      sendable: true,
      reason: "sendable",
      classification: generic.classification,
      allowlistedDomain: generic.allowlistedDomain,
    };
  }

  // Map the generic reasons that this INTRODUCTION wrapper can see
  // back onto the legacy D4e.2 reason union. Follow-up-only reasons
  // cannot be returned because INTRODUCTION skips those branches.
  switch (generic.reason) {
    case "blocked_wrong_category":
      return {
        sendable: false,
        reason: "blocked_not_introduction_step",
        detail: generic.detail,
        classification: generic.classification,
      };
    case "blocked_not_ready":
    case "blocked_already_sent":
    case "blocked_already_linked_outbound":
    case "blocked_allowlist_not_configured":
    case "blocked_allowlist_domain":
    case "blocked_plan_classifier":
      return {
        sendable: false,
        reason: generic.reason,
        detail: generic.detail,
        classification: generic.classification,
      };
    // These branches can never trigger for INTRODUCTION (no delay /
    // previous-step guard is applied). Fall through to a safe plan-
    // classifier-style block so the caller still gets a useful label.
    case "blocked_previous_step_not_sent":
    case "blocked_delay_not_elapsed":
    case "blocked_wrong_position":
      return {
        sendable: false,
        reason: "blocked_plan_classifier",
        detail: generic.detail,
        classification: generic.classification,
      };
  }
}

// ---------------------------------------------------------------------------
// Generic category-aware execution policy (D4e.3).
// ---------------------------------------------------------------------------

export type SequenceStepSendExecutionReason =
  | "sendable"
  | "blocked_wrong_category"
  | "blocked_not_ready"
  | "blocked_already_sent"
  | "blocked_already_linked_outbound"
  | "blocked_allowlist_not_configured"
  | "blocked_allowlist_domain"
  | "blocked_plan_classifier"
  | "blocked_previous_step_not_sent"
  | "blocked_delay_not_elapsed"
  | "blocked_wrong_position";

export type SequenceStepSendExecutionDecision =
  | {
      sendable: true;
      reason: "sendable";
      classification: SequenceStepSendClassification;
      allowlistedDomain: string;
    }
  | {
      sendable: false;
      reason: Exclude<SequenceStepSendExecutionReason, "sendable">;
      detail: string;
      classification: SequenceStepSendClassification | null;
    };

/**
 * Projection of the previous step's persisted send row. The server
 * layer picks the latest SENT row for the same enrollment + the
 * previous category's step and passes it here. `null` means no row
 * exists yet (or it exists but is not SENT).
 */
export type SequenceStepSendPreviousStep = {
  status: ClientEmailSequenceStepSendStatus;
  /** Time the row flipped to SENT. `updatedAt` of the step-send row. */
  sentAtIso: string;
} | null;

export type SequenceStepSendExecutionInput = {
  /** Category the operator is trying to send RIGHT NOW. */
  category: ClientEmailTemplateCategory;
  /** Projection of the persisted `ClientEmailSequenceStepSend` row. */
  stepSend: {
    id: string;
    status: ClientEmailSequenceStepSendStatus;
    outboundEmailId: string | null;
  };
  /** Category of the step this stepSend row belongs to (sanity check). */
  stepCategory: ClientEmailTemplateCategory;
  /** Rebuilt candidate for the plan-time classifier. */
  candidate: SequenceStepSendCandidate;
  /** Live allowlist snapshot (see `SequenceIntroSendExecutionInput`). */
  allowlist: {
    configured: boolean;
    domains: readonly string[];
  };
  /**
   * Previous category's step-send row, if any. Ignored for
   * INTRODUCTION. For FOLLOW_UP_N this must be the SENT row for the
   * previous category (INTRODUCTION for FOLLOW_UP_1, FOLLOW_UP_N-1
   * for FOLLOW_UP_N).
   */
  previousStepSend: SequenceStepSendPreviousStep;
  /** `delayDays` on the current step (>= 0). */
  delayDays: number;
  /** Additional delay hours after the previous step (follow-ups) or after schedule start (intro is handled at queue time). */
  delayHours: number;
  /**
   * When true, skip the governed-test domain allowlist (use after
   * `evaluateSendGovernance` returned `live_prospect`).
   */
  skipDomainAllowlist: boolean;
  /** Current wall-clock time as an ISO string. Injected for purity. */
  nowIso: string;
  /**
   * Enrollment's `currentStepPosition`. For FOLLOW_UP_N we refuse to
   * dispatch if this is ahead of `(thisStep.position - 1)` (e.g. the
   * enrollment already advanced past this step).
   */
  enrollmentCurrentStepPosition?: number;
  /** `position` of the current step in the sequence (1-indexed). */
  stepPosition?: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function safeParseIso(iso: string): number | null {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** Predicate form used by the UI snapshot loader. */
export function isFollowUpCategory(
  category: ClientEmailTemplateCategory,
): boolean {
  return category !== "INTRODUCTION";
}

/**
 * Returns the category immediately preceding the given category in
 * `TEMPLATE_CATEGORY_ORDER`. `INTRODUCTION` returns `null`. This
 * helper is pure so the server layer can use it to find the correct
 * `previousStepSend` row to pass into the classifier.
 */
export function previousCategoryFor(
  category: ClientEmailTemplateCategory,
): ClientEmailTemplateCategory | null {
  switch (category) {
    case "INTRODUCTION":
      return null;
    case "FOLLOW_UP_1":
      return "INTRODUCTION";
    case "FOLLOW_UP_2":
      return "FOLLOW_UP_1";
    case "FOLLOW_UP_3":
      return "FOLLOW_UP_2";
    case "FOLLOW_UP_4":
      return "FOLLOW_UP_3";
    case "FOLLOW_UP_5":
      return "FOLLOW_UP_4";
  }
}

/** Dispatch-time decision for exactly one step-send row (any category). */
export function classifySequenceStepSendExecution(
  input: SequenceStepSendExecutionInput,
): SequenceStepSendExecutionDecision {
  // 0. Structural guards.
  if (input.stepCategory !== input.category) {
    return {
      sendable: false,
      reason: "blocked_wrong_category",
      detail: `Step is ${input.stepCategory} but dispatcher was invoked with ${input.category}.`,
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

  // 4. Allowlist — required for allowlisted / internal test sends;
  //     skipped for live real-prospect dispatch after send governance.
  let recipientDomainForResult = "";
  if (!input.skipDomainAllowlist) {
    if (!input.allowlist.configured) {
      return {
        sendable: false,
        reason: "blocked_allowlist_not_configured",
        detail:
          "GOVERNED_TEST_EMAIL_DOMAINS is not configured — allowlisted test sends are disabled.",
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
    recipientDomainForResult = allow.domain ?? "";
  } else {
    recipientDomainForResult =
      normaliseDomain(input.candidate.contact.email) ?? "";
  }

  // 5. Follow-up-only guards: previous step SENT + delay elapsed +
  //    optional enrollment position sanity. INTRODUCTION skips all
  //    three — D4e.2 behaviour is preserved.
  if (isFollowUpCategory(input.category)) {
    if (!input.previousStepSend || input.previousStepSend.status !== "SENT") {
      return {
        sendable: false,
        reason: "blocked_previous_step_not_sent",
        detail: `Previous step (${
          previousCategoryFor(input.category) ?? "n/a"
        }) has not been SENT for this enrollment yet.`,
        classification,
      };
    }

    const prevSentAtMs = safeParseIso(input.previousStepSend.sentAtIso);
    const nowMs = safeParseIso(input.nowIso);
    if (prevSentAtMs === null || nowMs === null) {
      return {
        sendable: false,
        reason: "blocked_delay_not_elapsed",
        detail:
          "Could not parse previous step's SENT timestamp or current time — refusing to send.",
        classification,
      };
    }
    const delayMs =
      Math.max(0, input.delayDays) * DAY_MS +
      Math.max(0, input.delayHours) * HOUR_MS;
    if (nowMs < prevSentAtMs + delayMs) {
      const remainingMs = prevSentAtMs + delayMs - nowMs;
      const remainingHrs = Math.ceil(remainingMs / (60 * 60 * 1000));
      return {
        sendable: false,
        reason: "blocked_delay_not_elapsed",
        detail: `Delay after the previous step has not elapsed (~${String(remainingHrs)}h remaining).`,
        classification,
      };
    }

    // Optional position sanity — refuse if the enrollment is
    // somehow ahead of where this step would live. This protects
    // against accidental double-advance when a previous dispatcher
    // already ran and operator hasn't refreshed the UI.
    if (
      typeof input.enrollmentCurrentStepPosition === "number" &&
      typeof input.stepPosition === "number" &&
      input.enrollmentCurrentStepPosition >= input.stepPosition
    ) {
      return {
        sendable: false,
        reason: "blocked_wrong_position",
        detail: `Enrollment is already at step position ${String(input.enrollmentCurrentStepPosition)}, which is at or past this step's position ${String(input.stepPosition)}.`,
        classification,
      };
    }
  }

  return {
    sendable: true,
    reason: "sendable",
    classification,
    allowlistedDomain: recipientDomainForResult,
  };
}

// ---------------------------------------------------------------------------
// Aggregate counters. The D4e.2 shape is preserved verbatim so the
// introduction dispatcher continues to return identical counts. D4e.3
// adds a parallel set of counters for the generic classifier.
// ---------------------------------------------------------------------------

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

export type SequenceStepSendPlanCounts = {
  total: number;
  sendable: number;
  blockedAllowlist: number;
  blockedNotReady: number;
  blockedAlreadySent: number;
  blockedWrongCategory: number;
  blockedPlanClassifier: number;
  /** Previous step not SENT OR delay not yet elapsed. Follow-ups only. */
  blockedPrevious: number;
  /**
   * PR L — rows blocked by the launch-approval / real-prospect gate.
   * Non-allowlisted recipients that would require LIVE_PROSPECT
   * approval + one-click unsubscribe to send are counted here. They
   * are also persisted to the step-send row with a `blocked_*` code
   * prefix so the outreach timeline can label them.
   */
  blockedLaunchApproval: number;
};

export function zeroSequenceStepSendPlanCounts(): SequenceStepSendPlanCounts {
  return {
    total: 0,
    sendable: 0,
    blockedAllowlist: 0,
    blockedNotReady: 0,
    blockedAlreadySent: 0,
    blockedWrongCategory: 0,
    blockedPlanClassifier: 0,
    blockedPrevious: 0,
    blockedLaunchApproval: 0,
  };
}

export function incrementSequenceStepSendPlanCounts(
  counts: SequenceStepSendPlanCounts,
  decision: SequenceStepSendExecutionDecision,
): SequenceStepSendPlanCounts {
  const next: SequenceStepSendPlanCounts = {
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
    case "blocked_wrong_category":
      next.blockedWrongCategory += 1;
      return next;
    case "blocked_plan_classifier":
      next.blockedPlanClassifier += 1;
      return next;
    case "blocked_previous_step_not_sent":
    case "blocked_delay_not_elapsed":
    case "blocked_wrong_position":
      next.blockedPrevious += 1;
      return next;
    default: {
      return next;
    }
  }
}
