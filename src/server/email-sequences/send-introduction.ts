import "server-only";

import type {
  ClientEmailSequenceStepSendStatus,
  ClientEmailTemplateCategory,
} from "@/generated/prisma/enums";
import {
  blockedReasonForSequenceStepSend,
  evaluateSendGovernance,
  type SendKind,
} from "@/lib/clients/client-send-governance";
import {
  CONTROLLED_PILOT_HARD_MAX_RECIPIENTS,
} from "@/lib/controlled-pilot-constants";
import {
  getSequenceStepSendConfirmationPhrase,
  getSequenceStepSendMetadataKind,
  getSequenceStepSendReservationPrefix,
  isSequenceStepSendConfirmationAccepted,
} from "@/lib/email-sequences/sequence-send-execution-constants";
import {
  classifySequenceStepSendExecution,
  incrementSequenceStepSendPlanCounts,
  previousCategoryFor,
  zeroSequenceStepSendPlanCounts,
  type SequenceStepSendExecutionDecision,
  type SequenceStepSendPlanCounts,
  type SequenceStepSendPreviousStep,
} from "@/lib/email-sequences/sequence-send-execution-policy";
import type { SequenceStepSendCandidate } from "@/lib/email-sequences/sequence-send-policy";
import {
  allowedGovernedTestEmailDomains,
  isRecipientAllowedForGovernedTest,
} from "@/lib/governed-test-recipient";
import { prisma } from "@/lib/db";
import { extractDomainFromEmail, normalizeEmail } from "@/lib/normalize";
import { utcDateKeyForInstant } from "@/lib/sending-window";
import { requireClientAccess } from "@/server/tenant/access";
import type {
  ClientMailboxIdentity,
  StaffUser,
} from "@/generated/prisma/client";
import {
  getClientSenderProfile,
  type ClientSenderProfile,
} from "@/lib/opensdoors-brief";
import { composeSequenceEmail } from "@/lib/email-sequences/sequence-email-composition";
import { evaluateSuppression } from "@/server/outreach/suppression-guard";
import { triggerOutboundQueueDrain } from "@/server/email/outbound/trigger-queue";
import {
  countBookedSendSlotsInUtcWindow,
  linkReservationToOutboundInTransaction,
  mailboxIneligibleForGovernedSendExecution,
  tryReserveSendSlotInTransaction,
} from "@/server/mailbox/sending-policy";
import {
  isOneClickUnsubscribeReady,
  resolvePublicBaseUrl,
} from "@/lib/unsubscribe/one-click-readiness";
import {
  buildUnsubscribeUrl,
  generateRawUnsubscribeToken,
  hashUnsubscribeToken,
} from "@/lib/unsubscribe/unsubscribe-token";

/**
 * PR D4e.2 / D4e.3 — operator-triggered sequence step dispatcher.
 *
 * This helper is intentionally narrow:
 *
 *   * Sends exactly one step category per action (INTRODUCTION or
 *     FOLLOW_UP_1..5). No cross-category batching.
 *   * Consumes `ClientEmailSequenceStepSend` rows in status `READY`
 *     produced by the D4e.1 planner for the target step.
 *   * Re-validates every candidate at dispatch time
 *     (`classifySequenceStepSendExecution`) and re-evaluates suppression
 *     live so a stale READY can never send.
 *   * For FOLLOW_UP_N categories, requires the prior category's step
 *     send to already be SENT for the same enrollment, and that
 *     `delayDays` have elapsed since that SENT timestamp.
 *   * Requires a typed confirmation phrase matching the category
 *     (`SEND INTRODUCTION` / `SEND FOLLOW UP 1..5`).
 *   * Requires `GOVERNED_TEST_EMAIL_DOMAINS` to contain the
 *     recipient's domain — same allowlist the governed test / pilot
 *     paths use.
 *   * Hard-caps per run at `CONTROLLED_PILOT_HARD_MAX_RECIPIENTS`.
 *   * Reuses the existing `MailboxSendReservation` ledger + mailbox
 *     pool and the existing outbound queue worker path — no parallel
 *     send system. Each queued `OutboundEmail` transitions through
 *     QUEUED → PROCESSING → SENT / FAILED via
 *     `src/server/email/outbound/execute-one.ts`.
 *
 * No cron, no worker, no scheduler, no automatic follow-up
 * advancement — operator presses a different button for each step.
 */

// ---------------------------------------------------------------------------
// Error class. The class is `SequenceStepSendError`; `SequenceIntroSendError`
// is retained as an alias for D4e.2 call sites that pattern-match with
// `instanceof`.
// ---------------------------------------------------------------------------

export type SequenceStepSendFailureCode =
  | "CONFIRMATION_REQUIRED"
  | "SEQUENCE_NOT_FOUND"
  | "WRONG_CLIENT"
  | "SEQUENCE_NOT_APPROVED"
  | "NO_STEP_FOR_CATEGORY"
  | "NO_INTRODUCTION_STEP"
  | "TEMPLATE_NOT_APPROVED"
  | "NO_READY_ROWS"
  | "NO_MAILBOX_POOL"
  | "NO_MAILBOX_CAPACITY"
  | "HARD_CAP_EXCEEDED";

/** Legacy alias — retained for D4e.2 typed-failure code unions. */
export type SequenceIntroSendFailure = SequenceStepSendFailureCode;

export class SequenceStepSendError extends Error {
  readonly code: SequenceStepSendFailureCode;
  readonly category: ClientEmailTemplateCategory | null;
  constructor(
    code: SequenceStepSendFailureCode,
    message: string,
    category: ClientEmailTemplateCategory | null = null,
  ) {
    super(message);
    this.name = "SequenceStepSendError";
    this.code = code;
    this.category = category;
  }
}

/** @deprecated use `SequenceStepSendError`. Retained for D4e.2 call sites. */
export { SequenceStepSendError as SequenceIntroSendError };

// ---------------------------------------------------------------------------
// Result / row shapes.
// ---------------------------------------------------------------------------

export type SequenceStepSendBlockedRow = {
  stepSendId: string;
  contactEmail: string | null;
  reason: string;
  decisionReason: SequenceStepSendExecutionDecision["reason"];
};

export type SequenceStepSendQueuedRow = {
  stepSendId: string;
  outboundEmailId: string;
  contactEmail: string;
  allowlistedDomain: string;
};

export type SequenceStepSendBatchResult = {
  sequenceId: string;
  stepId: string;
  category: ClientEmailTemplateCategory;
  counts: SequenceStepSendPlanCounts & {
    /** Number of OutboundEmail rows actually queued in the ledger. */
    queued: number;
    /** Rows suppressed at live re-check (may differ from plan-time). */
    suppressedAtExecutionTime: number;
  };
  queued: SequenceStepSendQueuedRow[];
  blocked: SequenceStepSendBlockedRow[];
  allowlistDomains: string[];
  hardCap: number;
  mailboxPoolSize: number;
  aggregateRemainingAfter: number;
};

/** @deprecated use `SequenceStepSendBlockedRow`. */
export type SequenceIntroSendBlockedRow = SequenceStepSendBlockedRow;
/** @deprecated use `SequenceStepSendQueuedRow`. */
export type SequenceIntroSendQueuedRow = SequenceStepSendQueuedRow;
/** @deprecated use `SequenceStepSendBatchResult`. */
export type SequenceIntroSendResult = SequenceStepSendBatchResult;

// ---------------------------------------------------------------------------
// Mailbox-pool helpers (shared by INTRODUCTION and follow-up flows).
// ---------------------------------------------------------------------------

function executionEligibleMailboxes(
  rows: ClientMailboxIdentity[],
): ClientMailboxIdentity[] {
  return rows.filter(
    (m) => mailboxIneligibleForGovernedSendExecution(m) === null,
  );
}

function sortMailboxesForPoolPick(
  pool: ClientMailboxIdentity[],
  localRemaining: Map<string, number>,
): ClientMailboxIdentity[] {
  return [...pool].sort((a, b) => {
    const ra = localRemaining.get(a.id) ?? 0;
    const rb = localRemaining.get(b.id) ?? 0;
    if (rb !== ra) return rb - ra;
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Fallback unsubscribe link used only when one-click unsubscribe is
 * NOT wired (no public base URL configured). Preserves the previous
 * D4e.1 placeholder shape so allowlisted governed-test sends keep
 * rendering with a non-empty unsubscribe token. Real-prospect sends
 * are gated by `isOneClickUnsubscribeReady()` in the send governance
 * helper, so this branch is never taken for non-allowlisted recipients.
 */
function buildUnsubscribePlaceholder(
  clientDefaultSenderEmail: string | null,
): string {
  if (!clientDefaultSenderEmail) return "";
  return `mailto:${clientDefaultSenderEmail}?subject=unsubscribe`;
}

function buildSenderRow(
  client: { name: string; defaultSenderEmail: string | null },
  brief: ClientSenderProfile,
  unsubscribeLink: string,
) {
  return {
    senderName: client.name,
    senderEmail: client.defaultSenderEmail,
    senderCompanyName: brief.senderCompanyName,
    emailSignature: brief.emailSignature,
    unsubscribeLink: unsubscribeLink.length > 0 ? unsubscribeLink : null,
  };
}

const SUBJECT_DB_MAX = 300;
const BODY_DB_MAX = 50_000;

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, Math.max(0, max - 1)) + "…";
}

// ---------------------------------------------------------------------------
// Generic per-category dispatcher (PR D4e.3).
// ---------------------------------------------------------------------------

export async function sendSequenceStepBatch(input: {
  staff: StaffUser;
  clientId: string;
  sequenceId: string;
  /** INTRODUCTION or FOLLOW_UP_1..5. */
  category: ClientEmailTemplateCategory;
  /** Raw operator input — trimmed/validated inside this helper. */
  confirmationPhrase: string;
}): Promise<SequenceStepSendBatchResult> {
  const { staff, clientId, sequenceId, category } = input;
  await requireClientAccess(staff, clientId);

  // Confirmation phrase: trim defensively and match the per-category
  // phrase case-sensitively. Action-layer already trims — this is
  // belt-and-braces for any future caller.
  if (!isSequenceStepSendConfirmationAccepted(category, input.confirmationPhrase)) {
    throw new SequenceStepSendError(
      "CONFIRMATION_REQUIRED",
      `Type the exact confirmation phrase: ${getSequenceStepSendConfirmationPhrase(category)}`,
      category,
    );
  }

  // 1. Load the sequence + target-category step + template, scoped by
  //    clientId at every hop so a spoofed id cannot cross tenants.
  const sequence = await prisma.clientEmailSequence.findUnique({
    where: { id: sequenceId },
    select: {
      id: true,
      clientId: true,
      name: true,
      status: true,
      contactListId: true,
      steps: {
        where: { category },
        select: {
          id: true,
          sequenceId: true,
          category: true,
          position: true,
          delayDays: true,
          templateId: true,
          template: {
            select: {
              id: true,
              clientId: true,
              status: true,
              subject: true,
              content: true,
            },
          },
        },
      },
    },
  });
  if (!sequence) {
    throw new SequenceStepSendError(
      "SEQUENCE_NOT_FOUND",
      "Sequence not found.",
      category,
    );
  }
  if (sequence.clientId !== clientId) {
    throw new SequenceStepSendError(
      "WRONG_CLIENT",
      "Sequence belongs to a different client.",
      category,
    );
  }
  if (sequence.status !== "APPROVED") {
    throw new SequenceStepSendError(
      "SEQUENCE_NOT_APPROVED",
      `Sequence is ${sequence.status}, not APPROVED.`,
      category,
    );
  }
  const step = sequence.steps[0];
  if (!step) {
    throw new SequenceStepSendError(
      category === "INTRODUCTION" ? "NO_INTRODUCTION_STEP" : "NO_STEP_FOR_CATEGORY",
      `Sequence has no ${category} step.`,
      category,
    );
  }
  if (
    !step.template ||
    step.template.clientId !== clientId ||
    step.template.status !== "APPROVED"
  ) {
    throw new SequenceStepSendError(
      "TEMPLATE_NOT_APPROVED",
      `${category} template is missing or not APPROVED.`,
      category,
    );
  }
  const stepId = step.id;
  const stepCategory: ClientEmailTemplateCategory = step.category;
  const stepPosition = step.position;
  const stepDelayDays = Math.max(0, step.delayDays ?? 0);
  const template = step.template;

  // 2. Load READY step-send rows + enrollment + contact projections.
  const stepSendRows = await prisma.clientEmailSequenceStepSend.findMany({
    where: {
      clientId,
      sequenceId,
      stepId,
      status: "READY",
      outboundEmailId: null,
    },
    // Limit to the hard cap + 1 so the caller sees that we rejected
    // overflow rather than silently truncating.
    take: CONTROLLED_PILOT_HARD_MAX_RECIPIENTS + 1,
    orderBy: [{ createdAt: "asc" }],
    select: {
      id: true,
      status: true,
      idempotencyKey: true,
      outboundEmailId: true,
      enrollmentId: true,
      contactId: true,
      enrollment: {
        select: {
          id: true,
          clientId: true,
          sequenceId: true,
          contactId: true,
          status: true,
          currentStepPosition: true,
        },
      },
      contact: {
        select: {
          id: true,
          clientId: true,
          email: true,
          fullName: true,
          firstName: true,
          lastName: true,
          company: true,
          title: true,
          mobilePhone: true,
          officePhone: true,
          isSuppressed: true,
        },
      },
    },
  });
  if (stepSendRows.length === 0) {
    throw new SequenceStepSendError(
      "NO_READY_ROWS",
      `No READY ${category} step-send records for this sequence. Re-run 'Prepare send records' for this step first.`,
      category,
    );
  }
  if (stepSendRows.length > CONTROLLED_PILOT_HARD_MAX_RECIPIENTS) {
    throw new SequenceStepSendError(
      "HARD_CAP_EXCEEDED",
      `More than ${String(CONTROLLED_PILOT_HARD_MAX_RECIPIENTS)} READY records exist — re-plan a smaller batch or raise the cap deliberately.`,
      category,
    );
  }

  // 3. Load mailbox pool + client profile for sender fields.
  const [identities, client] = await Promise.all([
    prisma.clientMailboxIdentity.findMany({ where: { clientId } }),
    prisma.client.findUniqueOrThrow({
      where: { id: clientId },
      select: {
        id: true,
        name: true,
        status: true,
        defaultSenderEmail: true,
        // PR L — launch approval trail drives the real-prospect gate.
        launchApprovedAt: true,
        launchApprovalMode: true,
        onboarding: { select: { formData: true } },
      },
    }),
  ]);
  const pool = executionEligibleMailboxes(identities);
  if (pool.length === 0) {
    throw new SequenceStepSendError(
      "NO_MAILBOX_POOL",
      "No active connected sending mailboxes in this workspace.",
      category,
    );
  }

  const brief = getClientSenderProfile({
    client: { name: client.name },
    formData: client.onboarding?.formData ?? null,
  });
  // PR M — resolve the public base URL once per run. Real unsubscribe
  // URLs are built per-recipient inside the dispatch transaction (the
  // raw token is hashed + stored in `UnsubscribeToken`). If the public
  // base URL is not configured we fall back to the legacy mailto
  // placeholder so allowlisted / governed-test sends keep composing
  // with a non-empty `{{unsubscribe_link}}`; the real-prospect gate in
  // `evaluateSendGovernance` has already blocked non-allowlisted
  // recipients in that case.
  const publicBaseUrl = resolvePublicBaseUrl();
  const oneClickReady = isOneClickUnsubscribeReady();
  const fallbackUnsubscribeLink = buildUnsubscribePlaceholder(
    client.defaultSenderEmail,
  );
  const placeholderSenderRow = buildSenderRow(
    client,
    brief,
    fallbackUnsubscribeLink,
  );

  // 4. Live allowlist snapshot (env read once per run).
  const allowlist = {
    configured: typeof process.env.GOVERNED_TEST_EMAIL_DOMAINS === "string",
    domains: allowedGovernedTestEmailDomains(),
  };

  // 5. For follow-up categories, load the previous-category's SENT
  //    step-send rows so we can compute per-enrollment sentAt and
  //    enforce the delay guard at dispatch time.
  const prevCategory = previousCategoryFor(category);
  const previousSentByEnrollmentId = new Map<string, { sentAtIso: string }>();
  if (prevCategory !== null) {
    const enrollmentIds = stepSendRows.map((r) => r.enrollmentId);
    const prevRows = await prisma.clientEmailSequenceStepSend.findMany({
      where: {
        clientId,
        sequenceId,
        status: "SENT",
        enrollmentId: { in: enrollmentIds },
        step: { category: prevCategory },
      },
      select: {
        enrollmentId: true,
        updatedAt: true,
      },
    });
    for (const p of prevRows) {
      // If multiple rows exist (shouldn't happen — unique per
      // enrollment+step), keep the latest.
      const existing = previousSentByEnrollmentId.get(p.enrollmentId);
      const sentAtIso = p.updatedAt.toISOString();
      if (!existing || sentAtIso > existing.sentAtIso) {
        previousSentByEnrollmentId.set(p.enrollmentId, { sentAtIso });
      }
    }
  }

  // 6. Classify each candidate at dispatch time.
  let counts: SequenceStepSendPlanCounts = zeroSequenceStepSendPlanCounts();
  const blocked: SequenceStepSendBlockedRow[] = [];
  const queued: SequenceStepSendQueuedRow[] = [];
  let suppressedAtExecutionTime = 0;
  const nowIsoForClassifier = new Date().toISOString();
  const governanceSendKind: SendKind =
    category === "INTRODUCTION"
      ? "SEQUENCE_INTRODUCTION"
      : "SEQUENCE_FOLLOW_UP";
  // PR M — one-click unsubscribe is wired when the public base URL is
  // configured. `isOneClickUnsubscribeReady()` only reports whether
  // the rail is available; LIVE_PROSPECT launch approval + operator
  // confirmation + suppression/capacity checks remain required for
  // real prospect sends.
  const oneClickUnsubscribeReady = oneClickReady;
  const allowlistDomainSet = new Set(
    allowlist.domains.map((d) => d.toLowerCase()),
  );

  type PreparedRow = {
    stepSend: (typeof stepSendRows)[number];
    candidate: SequenceStepSendCandidate;
    decision: Extract<SequenceStepSendExecutionDecision, { sendable: true }>;
  };
  const prepared: PreparedRow[] = [];

  for (const row of stepSendRows) {
    const candidate: SequenceStepSendCandidate = {
      clientId,
      sequence: { id: sequence.id, clientId: sequence.clientId },
      step: {
        id: stepId,
        sequenceId,
        templateId: template.id,
      },
      template: {
        id: template.id,
        clientId: template.clientId,
        status: template.status,
        subject: template.subject,
        content: template.content,
      },
      enrollment: {
        id: row.enrollment.id,
        clientId: row.enrollment.clientId,
        sequenceId: row.enrollment.sequenceId,
        contactId: row.enrollment.contactId,
        status: row.enrollment.status,
      },
      contact: {
        id: row.contact.id,
        clientId: row.contact.clientId,
        firstName: row.contact.firstName,
        lastName: row.contact.lastName,
        fullName: row.contact.fullName,
        company: row.contact.company,
        role: row.contact.title,
        website: null,
        email: row.contact.email,
        mobilePhone: row.contact.mobilePhone,
        officePhone: row.contact.officePhone,
        isSuppressed: row.contact.isSuppressed,
      },
      // Use the placeholder sender row for plan-time classification.
      // The real per-recipient unsubscribe URL is built inside the
      // dispatch transaction below before composing the email we
      // actually queue.
      sender: placeholderSenderRow,
    };

    const prevProjection: SequenceStepSendPreviousStep =
      prevCategory === null
        ? null
        : (() => {
            const hit = previousSentByEnrollmentId.get(row.enrollmentId);
            return hit ? { status: "SENT", sentAtIso: hit.sentAtIso } : null;
          })();

    // PR L — run the real-prospect gate BEFORE the plan-time classifier
    // so every non-allowlisted recipient carries an explicit launch-
    // approval blocker reason on its step-send row, independent of the
    // D4e allowlist detail. Allowlisted recipients are passed through
    // to the existing classifier unchanged.
    const contactDomain =
      extractDomainFromEmail(row.contact.email ?? "")?.toLowerCase() ?? null;
    const recipientAllowlisted =
      allowlist.configured &&
      contactDomain !== null &&
      allowlistDomainSet.has(contactDomain);
    const governance = evaluateSendGovernance({
      client: {
        status: client.status,
        launchApprovedAt: client.launchApprovedAt,
        launchApprovalMode: client.launchApprovalMode,
      },
      recipientAllowlisted,
      sendKind: governanceSendKind,
      oneClickUnsubscribeReady,
    });
    if (!governance.allowed) {
      const governanceReason = blockedReasonForSequenceStepSend(governance);
      blocked.push({
        stepSendId: row.id,
        contactEmail: row.contact.email,
        reason: governanceReason,
        decisionReason: "blocked_allowlist_domain",
      });
      counts = {
        ...counts,
        total: counts.total + 1,
        blockedLaunchApproval: counts.blockedLaunchApproval + 1,
      };
      await prisma.clientEmailSequenceStepSend.update({
        where: { id: row.id },
        data: {
          status: "BLOCKED",
          blockedReason: truncate(governanceReason, 500),
        },
      });
      continue;
    }

    const decision = classifySequenceStepSendExecution({
      category,
      stepSend: {
        id: row.id,
        status: row.status,
        outboundEmailId: row.outboundEmailId,
      },
      stepCategory,
      candidate,
      allowlist,
      previousStepSend: prevProjection,
      delayDays: stepDelayDays,
      nowIso: nowIsoForClassifier,
      enrollmentCurrentStepPosition: row.enrollment.currentStepPosition,
      stepPosition,
    });
    counts = incrementSequenceStepSendPlanCounts(counts, decision);

    if (!decision.sendable) {
      blocked.push({
        stepSendId: row.id,
        contactEmail: row.contact.email,
        reason: decision.detail,
        decisionReason: decision.reason,
      });
      // Persist the block reason on the plan row so the timeline and
      // the planner UI reflect the live state. We never flip SENT/
      // FAILED here — that belongs to the actual dispatch loop below.
      await prisma.clientEmailSequenceStepSend.update({
        where: { id: row.id },
        data: {
          blockedReason: truncate(decision.detail, 500),
          // If the candidate re-classified as SUPPRESSED/BLOCKED we
          // update the stored status too so the operator has an
          // accurate picture without re-running "Prepare".
          status:
            decision.classification?.status === "SUPPRESSED"
              ? "SUPPRESSED"
              : decision.reason === "blocked_allowlist_domain" ||
                  decision.reason === "blocked_allowlist_not_configured"
                ? "BLOCKED"
                : row.status,
        },
      });
      continue;
    }

    prepared.push({ stepSend: row, candidate, decision });
  }

  // 7. Live suppression re-check per sendable row (belt-and-braces —
  //    the plan-time classifier used `contact.isSuppressed`, but the
  //    suppression list could have changed since then).
  const dispatchable: PreparedRow[] = [];
  for (const pr of prepared) {
    const email = normalizeEmail(pr.candidate.contact.email ?? "");
    const live = await evaluateSuppression(clientId, email);
    if (live.suppressed) {
      suppressedAtExecutionTime += 1;
      blocked.push({
        stepSendId: pr.stepSend.id,
        contactEmail: email,
        reason: `Recipient suppressed at dispatch time (${live.reason}).`,
        decisionReason: "blocked_plan_classifier",
      });
      await prisma.clientEmailSequenceStepSend.update({
        where: { id: pr.stepSend.id },
        data: {
          status: "SUPPRESSED",
          blockedReason: truncate(
            `Suppressed at dispatch (${live.reason}).`,
            500,
          ),
        },
      });
      continue;
    }
    dispatchable.push(pr);
  }

  if (dispatchable.length === 0) {
    return {
      sequenceId,
      stepId,
      category,
      counts: {
        ...counts,
        queued: 0,
        suppressedAtExecutionTime,
      },
      queued: [],
      blocked,
      allowlistDomains: [...allowlist.domains],
      hardCap: CONTROLLED_PILOT_HARD_MAX_RECIPIENTS,
      mailboxPoolSize: pool.length,
      aggregateRemainingAfter: 0,
    };
  }

  // 8. Ledger reservation + OutboundEmail creation in a short
  //    transaction per mailbox pick, mirroring the controlled-pilot
  //    shape so we get the same daily-cap guarantees.
  const at = new Date();
  const windowKey = utcDateKeyForInstant(at);
  const reservationPrefix = getSequenceStepSendReservationPrefix(category);
  const metadataKind = getSequenceStepSendMetadataKind(category);

  type TxResult = {
    stepSendId: string;
    outboundEmailId: string;
    email: string;
    allowlistedDomain: string;
  };
  const txResults: TxResult[] = [];

  try {
    await prisma.$transaction(
      async (tx) => {
        const localRemaining = new Map<string, number>();
        for (const m of pool) {
          const cap = Math.max(1, m.dailySendCap || 30);
          const booked = await countBookedSendSlotsInUtcWindow(
            tx,
            m.id,
            windowKey,
          );
          localRemaining.set(m.id, Math.max(0, cap - booked));
        }

        for (const pr of dispatchable) {
          const toEmail = normalizeEmail(pr.candidate.contact.email ?? "");
          // Belt-and-braces allowlist re-check inside the tx.
          if (!isRecipientAllowedForGovernedTest(toEmail)) {
            blocked.push({
              stepSendId: pr.stepSend.id,
              contactEmail: toEmail,
              reason:
                "Recipient domain is not in GOVERNED_TEST_EMAIL_DOMAINS (re-checked at dispatch).",
              decisionReason: "blocked_allowlist_domain",
            });
            await tx.clientEmailSequenceStepSend.update({
              where: { id: pr.stepSend.id },
              data: {
                status: "BLOCKED",
                blockedReason:
                  "Recipient domain is not in GOVERNED_TEST_EMAIL_DOMAINS (re-checked at dispatch).",
              },
            });
            continue;
          }

          const sorted = sortMailboxesForPoolPick(pool, localRemaining);
          let placed = false;

          for (const m of sorted) {
            const rem = localRemaining.get(m.id) ?? 0;
            if (rem <= 0) continue;

            const idempotencyKey = `${reservationPrefix}:${pr.stepSend.idempotencyKey}`;
            const reserve = await tryReserveSendSlotInTransaction(tx, {
              clientId,
              mailbox: m,
              idempotencyKey,
              at,
            });

            if (!reserve.ok) continue;
            if (reserve.duplicate) continue;

            // PR M — mint a per-recipient unsubscribe token at
            // dispatch time so the outbound body + List-Unsubscribe
            // header carry a real, resolvable link. When the public
            // base URL is not configured we fall back to the legacy
            // mailto placeholder; the governance helper has already
            // blocked non-allowlisted recipients in that case so this
            // branch only ever affects allowlisted / governed-test
            // sends.
            let rawUnsubscribeToken: string | null = null;
            let unsubscribeUrlForSend = fallbackUnsubscribeLink;
            if (publicBaseUrl !== null) {
              rawUnsubscribeToken = generateRawUnsubscribeToken();
              unsubscribeUrlForSend = buildUnsubscribeUrl({
                baseUrl: publicBaseUrl,
                rawToken: rawUnsubscribeToken,
              });
            }
            const senderRowForSend = buildSenderRow(
              client,
              brief,
              unsubscribeUrlForSend,
            );

            // Compose at dispatch time — we re-render to ensure the
            // actual sent bytes match what we class-checked seconds
            // ago. The planner's stored preview is informational.
            const composition = composeSequenceEmail({
              subject: template.subject,
              content: template.content,
              contact: pr.candidate.contact,
              sender: senderRowForSend,
            });
            if (!composition.ok || !composition.sendReady) {
              blocked.push({
                stepSendId: pr.stepSend.id,
                contactEmail: toEmail,
                reason:
                  "Composition lost send-readiness between planning and dispatch; re-plan.",
                decisionReason: "blocked_plan_classifier",
              });
              await tx.clientEmailSequenceStepSend.update({
                where: { id: pr.stepSend.id },
                data: {
                  status: "BLOCKED",
                  blockedReason:
                    "Composition lost send-readiness between planning and dispatch; re-plan.",
                },
              });
              await tx.mailboxSendReservation.update({
                where: { id: reserve.reservationId },
                data: { status: "RELEASED" },
              });
              placed = true;
              break;
            }

            const fromAddress = normalizeEmail(m.email);
            const subject = truncate(composition.subject, SUBJECT_DB_MAX);
            const bodyText = truncate(composition.body, BODY_DB_MAX);
            const toDomain = extractDomainFromEmail(toEmail) || null;

            const created = await tx.outboundEmail.create({
              data: {
                clientId,
                contactId: pr.candidate.contact.id,
                staffUserId: staff.id,
                toEmail,
                toDomain,
                subject,
                bodySnapshot: bodyText,
                status: "QUEUED",
                fromAddress,
                mailboxIdentityId: m.id,
                queuedAt: new Date(),
                metadata: {
                  kind: metadataKind,
                  sequenceId,
                  sequenceStepSendId: pr.stepSend.id,
                  sequenceEnrollmentId: pr.stepSend.enrollment.id,
                  sequenceStepId: stepId,
                  contactListId: sequence.contactListId,
                  templateId: template.id,
                  idempotencyKey: pr.stepSend.idempotencyKey,
                  stepCategory: category,
                  // `unsubscribeTokenHash` is intentionally NOT the raw
                  // token — only the hex hash is persisted so a leaked
                  // database dump cannot be used to forge unsubscribe
                  // links. The raw token only lives in the email body
                  // and the List-Unsubscribe header.
                  unsubscribeTokenConfigured: rawUnsubscribeToken !== null,
                } as object,
              },
            });

            // PR M — persist the unsubscribe token immediately so the
            // public route can redeem it even if the worker later
            // fails to dispatch. Only the hash is stored.
            if (rawUnsubscribeToken !== null) {
              await tx.unsubscribeToken.create({
                data: {
                  tokenHash: hashUnsubscribeToken(rawUnsubscribeToken),
                  clientId,
                  contactId: pr.candidate.contact.id,
                  outboundEmailId: created.id,
                  email: toEmail,
                  emailDomain: toDomain,
                  purpose: "outreach_unsubscribe",
                },
              });
            }

            await linkReservationToOutboundInTransaction(
              tx,
              reserve.reservationId,
              created.id,
            );

            await tx.clientEmailSequenceStepSend.update({
              where: { id: pr.stepSend.id },
              data: {
                status: "SENT",
                outboundEmailId: created.id,
                blockedReason: null,
                failureReason: null,
                subjectPreview: subject,
                bodyPreview: truncate(bodyText, 4000),
              },
            });

            // Advance the enrollment's currentStepPosition to the
            // current step's position so the next follow-up's
            // position sanity check sees a consistent picture.
            await tx.clientEmailSequenceEnrollment.update({
              where: { id: pr.stepSend.enrollment.id },
              data: {
                currentStepPosition: Math.max(
                  stepPosition,
                  pr.stepSend.enrollment.currentStepPosition,
                ),
              },
            });

            txResults.push({
              stepSendId: pr.stepSend.id,
              outboundEmailId: created.id,
              email: toEmail,
              allowlistedDomain: pr.decision.allowlistedDomain,
            });
            localRemaining.set(m.id, Math.max(0, rem - 1));
            placed = true;
            break;
          }

          if (!placed) {
            blocked.push({
              stepSendId: pr.stepSend.id,
              contactEmail: toEmail,
              reason: "No mailbox capacity remaining in this UTC day.",
              decisionReason: "blocked_plan_classifier",
            });
            await tx.clientEmailSequenceStepSend.update({
              where: { id: pr.stepSend.id },
              data: {
                blockedReason:
                  "No mailbox capacity remaining in this UTC day.",
              },
            });
          }
        }
      },
      { maxWait: 10_000, timeout: 60_000 },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new SequenceStepSendError(
      "NO_MAILBOX_CAPACITY",
      `Sequence ${category} dispatch failed: ${msg}`,
      category,
    );
  }

  for (const r of txResults) {
    queued.push({
      stepSendId: r.stepSendId,
      outboundEmailId: r.outboundEmailId,
      contactEmail: r.email,
      allowlistedDomain: r.allowlistedDomain,
    });
  }

  // 9. Kick the worker. The queue processor owns the actual Graph /
  //    Gmail send and reservation CONSUME / RELEASE.
  if (queued.length > 0) {
    await triggerOutboundQueueDrain();
  }

  // 10. Recompute aggregate remaining capacity for the UI summary.
  let aggregateRemainingAfter = 0;
  for (const m of pool) {
    const cap = Math.max(1, m.dailySendCap || 30);
    const bookedAfter = await prisma.mailboxSendReservation.count({
      where: {
        mailboxIdentityId: m.id,
        windowKey,
        status: { in: ["RESERVED", "CONSUMED"] },
      },
    });
    aggregateRemainingAfter += Math.max(0, cap - bookedAfter);
  }

  return {
    sequenceId,
    stepId,
    category,
    counts: {
      ...counts,
      queued: queued.length,
      suppressedAtExecutionTime,
    },
    queued,
    blocked,
    allowlistDomains: [...allowlist.domains],
    hardCap: CONTROLLED_PILOT_HARD_MAX_RECIPIENTS,
    mailboxPoolSize: pool.length,
    aggregateRemainingAfter,
  };
}

// ---------------------------------------------------------------------------
// Back-compat wrapper for D4e.2 call sites that only knew about intro.
// ---------------------------------------------------------------------------

export async function sendSequenceIntroductionBatch(input: {
  staff: StaffUser;
  clientId: string;
  sequenceId: string;
  confirmationPhrase: string;
}): Promise<SequenceStepSendBatchResult> {
  return sendSequenceStepBatch({
    staff: input.staff,
    clientId: input.clientId,
    sequenceId: input.sequenceId,
    category: "INTRODUCTION",
    confirmationPhrase: input.confirmationPhrase,
  });
}

// ---------------------------------------------------------------------------
// UI snapshot loaders.
// ---------------------------------------------------------------------------

export type SequenceStepSendUiSnapshot = {
  sequenceId: string;
  sequenceName: string;
  sequenceStatus: string;
  category: ClientEmailTemplateCategory;
  stepId: string | null;
  stepPosition: number | null;
  delayDays: number;
  templateApproved: boolean;
  enrollmentCount: number;
  readyCount: number;
  blockedCount: number;
  suppressedCount: number;
  sentCount: number;
  failedCount: number;
  /** Number of READY rows whose recipient domain passes the allowlist. */
  allowlistedReadyCount: number;
  /** READY rows whose recipient domain is NOT in the allowlist. */
  allowlistBlockedReadyCount: number;
  /**
   * READY rows whose previous-step SENT record is missing. Always 0
   * for INTRODUCTION.
   */
  previousStepMissingCount: number;
  /**
   * READY rows where the previous step has SENT but `delayDays` has
   * not yet elapsed for at least one contact. Always 0 for
   * INTRODUCTION.
   */
  delayPendingCount: number;
  /** Earliest moment any blocked-by-delay row will become eligible. */
  earliestEligibleAtIso: string | null;
  hardCap: number;
  sendable: boolean;
  disabledReason: string | null;
};

export type SequenceStepSendUiAllowlist = {
  configured: boolean;
  domains: readonly string[];
};

/** @deprecated use `SequenceStepSendUiSnapshot`. */
export type SequenceIntroSendUiSnapshot = SequenceStepSendUiSnapshot;
/** @deprecated use `SequenceStepSendUiAllowlist`. */
export type SequenceIntroSendUiAllowlist = SequenceStepSendUiAllowlist;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * PR D4e.3 — read-only snapshot for every (sequence × category) pair
 * that has a step in the sequence. Drives the Outreach "Send
 * preparation" card's INTRODUCTION dispatch block AND the new
 * FOLLOW_UP_N dispatch blocks.
 */
export async function loadSequenceStepSendUiSnapshots(
  clientId: string,
): Promise<{
  allowlist: SequenceStepSendUiAllowlist;
  snapshots: SequenceStepSendUiSnapshot[];
}> {
  const allowlist: SequenceStepSendUiAllowlist = {
    configured: typeof process.env.GOVERNED_TEST_EMAIL_DOMAINS === "string",
    domains: allowedGovernedTestEmailDomains(),
  };

  const sequences = await prisma.clientEmailSequence.findMany({
    where: { clientId },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      name: true,
      status: true,
      steps: {
        select: {
          id: true,
          category: true,
          position: true,
          delayDays: true,
          templateId: true,
          template: { select: { status: true } },
        },
      },
      _count: { select: { enrollments: true } },
    },
  });

  if (sequences.length === 0) {
    return { allowlist, snapshots: [] };
  }

  const sequenceIds = sequences.map((s) => s.id);
  // Load both the step-send rows for the sequences (for counts) AND
  // the previous-category SENT rows (for the delay-elapsed hints).
  const planRows = await prisma.clientEmailSequenceStepSend.findMany({
    where: {
      clientId,
      sequenceId: { in: sequenceIds },
    },
    select: {
      sequenceId: true,
      stepId: true,
      enrollmentId: true,
      status: true,
      updatedAt: true,
      contact: { select: { email: true } },
    },
  });

  const allowSet = new Set(allowlist.domains);
  const nowMs = Date.now();

  // Index previous-category SENT rows per (sequenceId, stepId) to
  // compute the delay-elapsed hints for each follow-up category.
  const sentByStepByEnrollment = new Map<string, Map<string, string>>();
  for (const r of planRows) {
    if (r.status !== "SENT") continue;
    const key = `${r.sequenceId}:${r.stepId}`;
    const inner =
      sentByStepByEnrollment.get(key) ?? new Map<string, string>();
    const sentIso = r.updatedAt.toISOString();
    const existing = inner.get(r.enrollmentId);
    if (!existing || sentIso > existing) {
      inner.set(r.enrollmentId, sentIso);
    }
    sentByStepByEnrollment.set(key, inner);
  }

  const snapshots: SequenceStepSendUiSnapshot[] = [];
  for (const s of sequences) {
    for (const step of s.steps) {
      const category = step.category;
      const rows = planRows.filter(
        (r) => r.sequenceId === s.id && r.stepId === step.id,
      );

      let readyCount = 0;
      let blockedCount = 0;
      let suppressedCount = 0;
      let sentCount = 0;
      let failedCount = 0;
      let allowlistedReadyCount = 0;
      let allowlistBlockedReadyCount = 0;
      let previousStepMissingCount = 0;
      let delayPendingCount = 0;
      let earliestEligibleAtMs: number | null = null;

      // Resolve previous-category step for this sequence (if any).
      const prevCategory = previousCategoryFor(category);
      const prevStep =
        prevCategory === null
          ? null
          : (s.steps.find((x) => x.category === prevCategory) ?? null);
      const prevSentByEnrollmentId =
        prevStep === null
          ? null
          : (sentByStepByEnrollment.get(`${s.id}:${prevStep.id}`) ??
              new Map<string, string>());

      for (const r of rows) {
        switch (r.status as ClientEmailSequenceStepSendStatus) {
          case "READY": {
            readyCount += 1;
            if (r.contact?.email) {
              const dom =
                extractDomainFromEmail(r.contact.email)?.toLowerCase() ?? "";
              if (allowlist.configured && allowSet.has(dom)) {
                allowlistedReadyCount += 1;
              } else {
                allowlistBlockedReadyCount += 1;
              }
            } else {
              allowlistBlockedReadyCount += 1;
            }

            if (prevCategory !== null) {
              const prevSentAtIso =
                prevSentByEnrollmentId?.get(r.enrollmentId) ?? null;
              if (prevSentAtIso === null) {
                previousStepMissingCount += 1;
              } else {
                const eligibleAtMs =
                  Date.parse(prevSentAtIso) + step.delayDays * DAY_MS;
                if (nowMs < eligibleAtMs) {
                  delayPendingCount += 1;
                  if (
                    earliestEligibleAtMs === null ||
                    eligibleAtMs < earliestEligibleAtMs
                  ) {
                    earliestEligibleAtMs = eligibleAtMs;
                  }
                }
              }
            }
            break;
          }
          case "BLOCKED":
            blockedCount += 1;
            break;
          case "SUPPRESSED":
            suppressedCount += 1;
            break;
          case "SENT":
            sentCount += 1;
            break;
          case "FAILED":
            failedCount += 1;
            break;
          default:
            break;
        }
      }

      const templateApproved = step.template.status === "APPROVED";
      // Effective "ready now" = allowlisted AND not blocked by
      // previous-step/delay for follow-ups. The dispatcher is the
      // single source of truth but this snapshot is used to gate the
      // UI button.
      const effectiveReadyNow =
        prevCategory === null
          ? allowlistedReadyCount
          : Math.max(
              0,
              allowlistedReadyCount -
                previousStepMissingCount -
                delayPendingCount,
            );

      let disabledReason: string | null = null;
      if (s.status !== "APPROVED") {
        disabledReason = `Sequence is ${s.status}, not APPROVED.`;
      } else if (!templateApproved) {
        disabledReason = `${category} template is not APPROVED.`;
      } else if (!allowlist.configured) {
        disabledReason =
          "GOVERNED_TEST_EMAIL_DOMAINS is not configured — sequence sending is disabled.";
      } else if (allowlist.domains.length === 0) {
        disabledReason =
          "GOVERNED_TEST_EMAIL_DOMAINS resolved to an empty list.";
      } else if (effectiveReadyNow === 0) {
        if (previousStepMissingCount > 0 && prevCategory !== null) {
          disabledReason = `Previous step (${prevCategory}) has not been SENT for any allowlisted recipient yet.`;
        } else if (delayPendingCount > 0) {
          disabledReason = `Delay (${String(step.delayDays)} days) has not elapsed for any allowlisted recipient yet.`;
        } else {
          disabledReason =
            "No READY records whose recipient domain passes GOVERNED_TEST_EMAIL_DOMAINS.";
        }
      }

      snapshots.push({
        sequenceId: s.id,
        sequenceName: s.name,
        sequenceStatus: s.status,
        category,
        stepId: step.id,
        stepPosition: step.position,
        delayDays: step.delayDays,
        templateApproved,
        enrollmentCount: s._count.enrollments,
        readyCount,
        blockedCount,
        suppressedCount,
        sentCount,
        failedCount,
        allowlistedReadyCount,
        allowlistBlockedReadyCount,
        previousStepMissingCount,
        delayPendingCount,
        earliestEligibleAtIso:
          earliestEligibleAtMs === null
            ? null
            : new Date(earliestEligibleAtMs).toISOString(),
        hardCap: CONTROLLED_PILOT_HARD_MAX_RECIPIENTS,
        sendable: disabledReason === null,
        disabledReason,
      });
    }
  }

  return { allowlist, snapshots };
}

/**
 * @deprecated use `loadSequenceStepSendUiSnapshots`. Retained so the
 * outreach page and the D4e.2 UI can still call the introduction-only
 * loader while we migrate (same underlying query, filtered to
 * INTRODUCTION).
 */
export async function loadSequenceIntroSendUiSnapshots(
  clientId: string,
): Promise<{
  allowlist: SequenceStepSendUiAllowlist;
  snapshots: SequenceStepSendUiSnapshot[];
}> {
  const { allowlist, snapshots } =
    await loadSequenceStepSendUiSnapshots(clientId);
  return {
    allowlist,
    snapshots: snapshots.filter((s) => s.category === "INTRODUCTION"),
  };
}
