import "server-only";

import type {
  ClientEmailSequenceStepSendStatus,
  ClientEmailTemplateCategory,
} from "@/generated/prisma/enums";
import {
  CONTROLLED_PILOT_HARD_MAX_RECIPIENTS,
} from "@/lib/controlled-pilot-constants";
import {
  isSequenceIntroConfirmationAccepted,
  SEQUENCE_INTRO_RESERVATION_KEY_PREFIX,
  SEQUENCE_INTRO_SEND_CONFIRMATION_PHRASE,
  SEQUENCE_INTRO_SEND_METADATA_KIND,
} from "@/lib/email-sequences/sequence-send-execution-constants";
import {
  classifySequenceIntroSendExecution,
  incrementSequenceIntroSendPlanCounts,
  zeroSequenceIntroSendPlanCounts,
  type SequenceIntroSendExecutionDecision,
  type SequenceIntroSendPlanCounts,
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

/**
 * PR D4e.2 — operator-triggered INTRODUCTION step dispatcher.
 *
 * This helper is intentionally narrow:
 *
 *   * Sends the INTRODUCTION step only (no follow-ups).
 *   * Consumes `ClientEmailSequenceStepSend` rows in status `READY`
 *     produced by the D4e.1 planner.
 *   * Re-validates every candidate at dispatch time (`classifySequence
 *     IntroSendExecution`) and re-evaluates suppression live so a
 *     stale READY can never send.
 *   * Requires a typed confirmation phrase (`SEND INTRODUCTION`).
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
 * No cron, no worker, no scheduler, no follow-up advancement.
 */

export type SequenceIntroSendFailure =
  | "CONFIRMATION_REQUIRED"
  | "SEQUENCE_NOT_FOUND"
  | "WRONG_CLIENT"
  | "SEQUENCE_NOT_APPROVED"
  | "NO_INTRODUCTION_STEP"
  | "TEMPLATE_NOT_APPROVED"
  | "NO_READY_ROWS"
  | "NO_MAILBOX_POOL"
  | "NO_MAILBOX_CAPACITY"
  | "HARD_CAP_EXCEEDED";

export class SequenceIntroSendError extends Error {
  readonly code: SequenceIntroSendFailure;
  constructor(code: SequenceIntroSendFailure, message: string) {
    super(message);
    this.name = "SequenceIntroSendError";
    this.code = code;
  }
}

export type SequenceIntroSendBlockedRow = {
  stepSendId: string;
  contactEmail: string | null;
  reason: string;
  decisionReason: SequenceIntroSendExecutionDecision["reason"];
};

export type SequenceIntroSendQueuedRow = {
  stepSendId: string;
  outboundEmailId: string;
  contactEmail: string;
  allowlistedDomain: string;
};

export type SequenceIntroSendResult = {
  sequenceId: string;
  stepId: string;
  counts: SequenceIntroSendPlanCounts & {
    /** Number of OutboundEmail rows actually queued in the ledger. */
    queued: number;
    /** Rows suppressed at live re-check (may differ from plan-time). */
    suppressedAtExecutionTime: number;
  };
  queued: SequenceIntroSendQueuedRow[];
  blocked: SequenceIntroSendBlockedRow[];
  allowlistDomains: string[];
  hardCap: number;
  mailboxPoolSize: number;
  aggregateRemainingAfter: number;
};

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

export async function sendSequenceIntroductionBatch(input: {
  staff: StaffUser;
  clientId: string;
  sequenceId: string;
  confirmationPhrase: string;
}): Promise<SequenceIntroSendResult> {
  const { staff, clientId, sequenceId } = input;
  await requireClientAccess(staff, clientId);

  // Hotfix after D4e.2: trim defensively here as well, so any future
  // caller that forgets to normalise at the action boundary still
  // behaves correctly. The exact phrase comparison remains
  // case-sensitive; only surrounding whitespace is relaxed.
  if (!isSequenceIntroConfirmationAccepted(input.confirmationPhrase)) {
    throw new SequenceIntroSendError(
      "CONFIRMATION_REQUIRED",
      `Type the exact confirmation phrase: ${SEQUENCE_INTRO_SEND_CONFIRMATION_PHRASE}`,
    );
  }

  // 1. Load the sequence + INTRODUCTION step + template, scoped by
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
        where: { category: "INTRODUCTION" },
        select: {
          id: true,
          sequenceId: true,
          category: true,
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
    throw new SequenceIntroSendError(
      "SEQUENCE_NOT_FOUND",
      "Sequence not found.",
    );
  }
  if (sequence.clientId !== clientId) {
    throw new SequenceIntroSendError(
      "WRONG_CLIENT",
      "Sequence belongs to a different client.",
    );
  }
  if (sequence.status !== "APPROVED") {
    throw new SequenceIntroSendError(
      "SEQUENCE_NOT_APPROVED",
      `Sequence is ${sequence.status}, not APPROVED.`,
    );
  }
  const introStep = sequence.steps[0];
  if (!introStep) {
    throw new SequenceIntroSendError(
      "NO_INTRODUCTION_STEP",
      "Sequence has no INTRODUCTION step.",
    );
  }
  if (
    !introStep.template ||
    introStep.template.clientId !== clientId ||
    introStep.template.status !== "APPROVED"
  ) {
    throw new SequenceIntroSendError(
      "TEMPLATE_NOT_APPROVED",
      "INTRODUCTION template is missing or not APPROVED.",
    );
  }
  const stepId = introStep.id;
  const stepCategory: ClientEmailTemplateCategory = introStep.category;
  const template = introStep.template;

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
    throw new SequenceIntroSendError(
      "NO_READY_ROWS",
      "No READY introduction step-send records for this sequence. Re-run 'Prepare introduction send records' first.",
    );
  }
  if (stepSendRows.length > CONTROLLED_PILOT_HARD_MAX_RECIPIENTS) {
    throw new SequenceIntroSendError(
      "HARD_CAP_EXCEEDED",
      `More than ${String(CONTROLLED_PILOT_HARD_MAX_RECIPIENTS)} READY records exist — re-plan a smaller batch or raise the cap deliberately.`,
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
        defaultSenderEmail: true,
        onboarding: { select: { formData: true } },
      },
    }),
  ]);
  const pool = executionEligibleMailboxes(identities);
  if (pool.length === 0) {
    throw new SequenceIntroSendError(
      "NO_MAILBOX_POOL",
      "No active connected sending mailboxes in this workspace.",
    );
  }

  const brief = getClientSenderProfile({
    client: { name: client.name },
    formData: client.onboarding?.formData ?? null,
  });
  const unsubscribeLink = buildUnsubscribePlaceholder(client.defaultSenderEmail);
  const senderRow = buildSenderRow(client, brief, unsubscribeLink);

  // 4. Live allowlist snapshot (env read once per run).
  const allowlist = {
    configured: typeof process.env.GOVERNED_TEST_EMAIL_DOMAINS === "string",
    domains: allowedGovernedTestEmailDomains(),
  };

  // 5. Classify each candidate at dispatch time.
  let counts: SequenceIntroSendPlanCounts = zeroSequenceIntroSendPlanCounts();
  const blocked: SequenceIntroSendBlockedRow[] = [];
  const queued: SequenceIntroSendQueuedRow[] = [];
  let suppressedAtExecutionTime = 0;

  type PreparedRow = {
    stepSend: (typeof stepSendRows)[number];
    candidate: SequenceStepSendCandidate;
    decision: Extract<SequenceIntroSendExecutionDecision, { sendable: true }>;
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
      sender: senderRow,
    };

    const decision = classifySequenceIntroSendExecution({
      stepSend: {
        id: row.id,
        status: row.status,
        outboundEmailId: row.outboundEmailId,
      },
      stepCategory,
      candidate,
      allowlist,
    });
    counts = incrementSequenceIntroSendPlanCounts(counts, decision);

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

  // 6. Live suppression re-check per sendable row (belt-and-braces —
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
    // Short-circuit: nothing to dispatch, nothing to queue. Return
    // with counts so the UI can surface the blocked reasons.
    return {
      sequenceId,
      stepId,
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

  // 7. Ledger reservation + OutboundEmail creation in a short
  //    transaction per mailbox pick, mirroring the controlled-pilot
  //    shape so we get the same daily-cap guarantees.
  const at = new Date();
  const windowKey = utcDateKeyForInstant(at);

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

            const idempotencyKey = `${SEQUENCE_INTRO_RESERVATION_KEY_PREFIX}:${pr.stepSend.idempotencyKey}`;
            const reserve = await tryReserveSendSlotInTransaction(tx, {
              clientId,
              mailbox: m,
              idempotencyKey,
              at,
            });

            if (!reserve.ok) continue;
            if (reserve.duplicate) continue;

            // Compose at dispatch time — we re-render to ensure the
            // actual sent bytes match what we class-checked seconds
            // ago. The planner's stored preview is informational.
            const composition = composeSequenceEmail({
              subject: template.subject,
              content: template.content,
              contact: pr.candidate.contact,
              sender: senderRow,
            });
            if (!composition.ok || !composition.sendReady) {
              // Extremely unlikely — the execution policy already
              // required READY. Release the slot by letting the tx
              // rollback path (continue without linking).
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
              // Release the just-reserved slot.
              await tx.mailboxSendReservation.update({
                where: { id: reserve.reservationId },
                data: { status: "RELEASED" },
              });
              placed = true; // stop trying other mailboxes for this row
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
                  kind: SEQUENCE_INTRO_SEND_METADATA_KIND,
                  sequenceId,
                  sequenceStepSendId: pr.stepSend.id,
                  sequenceEnrollmentId: pr.stepSend.enrollment.id,
                  sequenceStepId: stepId,
                  contactListId: sequence.contactListId,
                  templateId: template.id,
                  idempotencyKey: pr.stepSend.idempotencyKey,
                  stepCategory: "INTRODUCTION",
                } as object,
              },
            });

            await linkReservationToOutboundInTransaction(
              tx,
              reserve.reservationId,
              created.id,
            );

            // Transition the plan row to SENT and link the
            // OutboundEmail. The worker will run the actual provider
            // send; if that fails the worker flips OutboundEmail to
            // FAILED but that does not retroactively un-SENT the plan
            // row — this mirrors the governed/pilot contract where
            // the ledger tracks intent-to-send, provider events track
            // dispatch outcome. D4e.3 can reconcile FAILED outbound
            // rows back to the plan row if needed.
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

            // Advance the enrollment's currentStepPosition to 1 once
            // the INTRODUCTION step has been dispatched. This is the
            // only write D4e.2 makes against enrollment state; D4e.3
            // will be responsible for follow-up advancement and any
            // transition to COMPLETED.
            await tx.clientEmailSequenceEnrollment.update({
              where: { id: pr.stepSend.enrollment.id },
              data: {
                currentStepPosition: Math.max(
                  1,
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
    throw new SequenceIntroSendError(
      "NO_MAILBOX_CAPACITY",
      `Sequence introduction dispatch failed: ${msg}`,
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

  // 8. Kick the worker. The queue processor owns the actual Graph /
  //    Gmail send and reservation CONSUME / RELEASE.
  if (queued.length > 0) {
    await triggerOutboundQueueDrain();
  }

  // 9. Recompute aggregate remaining capacity for the UI summary.
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

/**
 * Page-level read-only snapshot for the Outreach "Send introduction"
 * UI. Computes per-sequence counts of READY / BLOCKED / SUPPRESSED /
 * SENT step-send rows for the INTRODUCTION step, the allowlist config
 * state, and whether a dispatch action should be enabled.
 */
export type SequenceIntroSendUiSnapshot = {
  sequenceId: string;
  sequenceName: string;
  sequenceStatus: string;
  stepId: string | null;
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
  hardCap: number;
  sendable: boolean;
  disabledReason: string | null;
};

export type SequenceIntroSendUiAllowlist = {
  configured: boolean;
  domains: readonly string[];
};

export async function loadSequenceIntroSendUiSnapshots(
  clientId: string,
): Promise<{
  allowlist: SequenceIntroSendUiAllowlist;
  snapshots: SequenceIntroSendUiSnapshot[];
}> {
  const allowlist: SequenceIntroSendUiAllowlist = {
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
        where: { category: "INTRODUCTION" },
        select: {
          id: true,
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
  const planRows = await prisma.clientEmailSequenceStepSend.findMany({
    where: {
      clientId,
      sequenceId: { in: sequenceIds },
    },
    select: {
      sequenceId: true,
      stepId: true,
      status: true,
      contact: { select: { email: true } },
    },
  });

  const allowSet = new Set(allowlist.domains);

  const snapshots: SequenceIntroSendUiSnapshot[] = sequences.map((s) => {
    const introStep = s.steps[0] ?? null;
    const rows = planRows.filter(
      (r) => r.sequenceId === s.id && introStep && r.stepId === introStep.id,
    );

    let readyCount = 0;
    let blockedCount = 0;
    let suppressedCount = 0;
    let sentCount = 0;
    let failedCount = 0;
    let allowlistedReadyCount = 0;
    let allowlistBlockedReadyCount = 0;

    for (const r of rows) {
      switch (r.status as ClientEmailSequenceStepSendStatus) {
        case "READY":
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
          break;
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

    const templateApproved = introStep?.template.status === "APPROVED";
    let disabledReason: string | null = null;
    if (s.status !== "APPROVED") {
      disabledReason = `Sequence is ${s.status}, not APPROVED.`;
    } else if (!introStep) {
      disabledReason = "Sequence has no INTRODUCTION step.";
    } else if (!templateApproved) {
      disabledReason = "INTRODUCTION template is not APPROVED.";
    } else if (!allowlist.configured) {
      disabledReason =
        "GOVERNED_TEST_EMAIL_DOMAINS is not configured — sequence sending is disabled.";
    } else if (allowlist.domains.length === 0) {
      disabledReason =
        "GOVERNED_TEST_EMAIL_DOMAINS resolved to an empty list.";
    } else if (allowlistedReadyCount === 0) {
      disabledReason =
        "No READY records whose recipient domain passes GOVERNED_TEST_EMAIL_DOMAINS.";
    }

    return {
      sequenceId: s.id,
      sequenceName: s.name,
      sequenceStatus: s.status,
      stepId: introStep?.id ?? null,
      templateApproved,
      enrollmentCount: s._count.enrollments,
      readyCount,
      blockedCount,
      suppressedCount,
      sentCount,
      failedCount,
      allowlistedReadyCount,
      allowlistBlockedReadyCount,
      hardCap: CONTROLLED_PILOT_HARD_MAX_RECIPIENTS,
      sendable: disabledReason === null,
      disabledReason,
    };
  });

  return { allowlist, snapshots };
}
