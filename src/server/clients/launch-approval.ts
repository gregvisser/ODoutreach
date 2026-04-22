import "server-only";

import { prisma } from "@/lib/db";
import {
  buildLaunchReadinessRows,
  type LaunchReadinessRow,
} from "@/lib/client-launch-state";
import {
  evaluateClientLaunchApproval,
  LAUNCH_APPROVAL_NOTES_MAX as LAUNCH_APPROVAL_NOTES_MAX_LIB,
  type ClientLaunchApprovalMode,
  type LaunchApprovalPolicyInput,
  type LaunchApprovalPolicyResult,
} from "@/lib/clients/client-launch-approval";
import { buildGettingStartedViewModel } from "@/lib/clients/getting-started-view-model";
import { parseOpensDoorsBrief } from "@/lib/opensdoors-brief";
import { REQUIRED_OUTREACH_MAILBOX_COUNT } from "@/lib/outreach-mailbox-model";
import { getAccessibleClientIds } from "@/server/tenant/access";
import { getClientEmailSequenceCounts } from "@/server/email-sequences/queries";
import { getClientMailboxMutationAllowed } from "@/server/mailbox-identities/mutator-access";
import { loadClientWorkspaceBundle } from "@/server/queries/client-workspace-bundle";
import type { StaffUser } from "@/generated/prisma/client";
import type { ClientLifecycleStatus } from "@/generated/prisma/enums";

/**
 * PR K — Launch approval is a hard-coded "not wired up yet" field for
 * one-click unsubscribe readiness. Kept as a constant so a future PR can
 * flip a single source of truth when the unsubscribe header ships.
 */
export const ONE_CLICK_UNSUBSCRIBE_READY = false;

export type LaunchApprovalSnapshot = {
  clientId: string;
  clientStatus: ClientLifecycleStatus;
  launchApprovedAt: Date | null;
  launchApprovedByStaffUserId: string | null;
  launchApprovalMode: ClientLaunchApprovalMode | null;
  launchApprovalNotes: string | null;
  /** The stored checklist from the approved launch, if any. */
  storedChecklist: unknown;
  approvedByStaff: {
    id: string;
    email: string;
    displayName: string | null;
  } | null;
  canMutate: boolean;
  policy: LaunchApprovalPolicyResult;
  /** The mode the policy was evaluated against (CONTROLLED_INTERNAL today). */
  evaluatedMode: ClientLaunchApprovalMode;
  /** Echoed readiness rows so the card can show module-level blockers. */
  readinessRows: LaunchReadinessRow[];
};

/**
 * Build the launch-approval snapshot for a given client and staff member.
 * Mirrors the inputs the UI card uses so the server action can re-evaluate
 * the policy without trusting client-provided state.
 *
 * Returns `null` when the staff user cannot access the client (caller
 * should surface this as a generic "not found" / "forbidden" depending
 * on context — we never enumerate tenants).
 */
export async function loadClientLaunchApprovalSnapshot(
  clientId: string,
  staff: Pick<StaffUser, "id" | "role">,
  mode: ClientLaunchApprovalMode = "CONTROLLED_INTERNAL",
): Promise<LaunchApprovalSnapshot | null> {
  const accessible = await getAccessibleClientIds(staff);
  if (!accessible.includes(clientId)) return null;

  const bundle = await loadClientWorkspaceBundle(
    clientId,
    accessible,
    staff as StaffUser,
  );
  if (!bundle.client) return null;
  const client = bundle.client;

  const [sequenceCounts, enrolledContactsCount] = await Promise.all([
    getClientEmailSequenceCounts(client.id),
    prisma.clientEmailSequenceEnrollment.count({
      where: { clientId: client.id },
    }),
  ]);

  const suppressionLatestSyncAt = (() => {
    const dates = client.suppressionSources
      .map((s) => s.lastSyncedAt)
      .filter((d): d is NonNullable<typeof d> => d != null);
    if (dates.length === 0) return null;
    return dates.reduce((a, b) => (a > b ? a : b));
  })();

  const snapshotInput = {
    clientId: client.id,
    brief: bundle.onboardingCompletion,
    connectedSendingCount: bundle.connectedSendingCount,
    recommendedMailboxCount: REQUIRED_OUTREACH_MAILBOX_COUNT,
    suppressionSheetCount: bundle.suppressionSheetRows.length,
    googleSheetsEnvReady: bundle.googleSheetsEnvReady,
    contactsTotal: client._count.contacts,
    contactsEligible: bundle.pilotContactSummary.eligibleCount,
    contactsSuppressedCount: bundle.pilotContactSummary.suppressedCount,
    rocketReachEnvReady: bundle.rocketReachEnvReady,
    outreachPilotRunnable:
      bundle.hasGovernedMailbox &&
      bundle.oauthReadyForGovernedTest &&
      bundle.poolCanSendPilot,
    latestActivityLabel: bundle.latestGovernedAt
      ? new Date(bundle.latestGovernedAt).toISOString().slice(0, 16).replace("T", " ")
      : null,
    approvedSequencesCount: sequenceCounts.approvedSequencesCount,
    approvedIntroductionTemplatesCount:
      sequenceCounts.approvedIntroductionTemplatesCount,
  };

  const readinessRows = buildLaunchReadinessRows({
    ...snapshotInput,
    suppressionLatestSyncAt,
  });

  const gettingStarted = buildGettingStartedViewModel({
    clientId: client.id,
    clientStatus: client.status,
    briefStatus: bundle.onboardingCompletion.status,
    connectedSendingCount: bundle.connectedSendingCount,
    suppressionSheetCount: bundle.suppressionSheetRows.length,
    contactsTotal: client._count.contacts,
    enrolledContactsCount,
    approvedTemplatesCount: sequenceCounts.approvedTemplatesTotal,
    approvedSequencesCount: sequenceCounts.approvedSequencesCount,
    outreachPilotRunnable: snapshotInput.outreachPilotRunnable,
  });

  const brief = parseOpensDoorsBrief(client.onboarding?.formData);
  // A mailbox-level signature (synced or manual) satisfies launch readiness
  // just like the brief fallback — any connected mailbox with either a
  // stored text or HTML signature is enough (PR — mailbox sender signatures).
  const hasBriefSignature = !!brief.emailSignature?.trim();
  const hasAnyMailboxSignature = client.mailboxIdentities.some(
    (m) =>
      (m.senderSignatureText && m.senderSignatureText.trim().length > 0) ||
      (m.senderSignatureHtml && m.senderSignatureHtml.trim().length > 0),
  );
  const hasSenderSignature = hasBriefSignature || hasAnyMailboxSignature;

  const policyInput: LaunchApprovalPolicyInput = {
    clientStatus: client.status,
    gettingStarted,
    readinessRows,
    approvedSequencesCount: sequenceCounts.approvedSequencesCount,
    approvedIntroductionTemplatesCount:
      sequenceCounts.approvedIntroductionTemplatesCount,
    enrolledContactsCount,
    hasSenderSignature,
    oneClickUnsubscribeReady: ONE_CLICK_UNSUBSCRIBE_READY,
    mode,
  };

  const policy = evaluateClientLaunchApproval(policyInput);

  let approvedByStaff: LaunchApprovalSnapshot["approvedByStaff"] = null;
  if (client.launchApprovedByStaffUserId) {
    const approver = await prisma.staffUser.findUnique({
      where: { id: client.launchApprovedByStaffUserId },
      select: { id: true, email: true, displayName: true },
    });
    approvedByStaff = approver ?? null;
  }

  const canMutate = await getClientMailboxMutationAllowed(staff, clientId);

  return {
    clientId: client.id,
    clientStatus: client.status,
    launchApprovedAt: client.launchApprovedAt,
    launchApprovedByStaffUserId: client.launchApprovedByStaffUserId,
    launchApprovalMode: client.launchApprovalMode,
    launchApprovalNotes: client.launchApprovalNotes,
    storedChecklist: client.launchApprovalChecklist,
    approvedByStaff,
    canMutate,
    policy,
    evaluatedMode: mode,
    readinessRows,
  };
}

export type ApproveClientLaunchResult =
  | {
      ok: true;
      clientId: string;
      launchApprovedAt: string;
      mode: ClientLaunchApprovalMode;
    }
  | {
      ok: false;
      code:
        | "FORBIDDEN"
        | "NOT_FOUND"
        | "ALREADY_ACTIVE"
        | "MODE_NOT_ALLOWED"
        | "CONFIRMATION_INVALID"
        | "POLICY_BLOCKED"
        | "NOTES_TOO_LONG"
        | "UNKNOWN_ERROR";
      message: string;
      blockers?: string[];
    };

export const LAUNCH_APPROVAL_NOTES_MAX = LAUNCH_APPROVAL_NOTES_MAX_LIB;

/** Modes a human operator can select today. LIVE_PROSPECT is schema-only until a future PR. */
export const OPERATOR_SELECTABLE_APPROVAL_MODES: readonly ClientLaunchApprovalMode[] = [
  "CONTROLLED_INTERNAL",
] as const;

/**
 * PR K — Approve a client's launch.
 *
 * This helper is the single server-side gate:
 *  1. staff access + mutator permission
 *  2. re-evaluate the launch-approval policy from DB-backed state
 *  3. enforce the verbatim confirmation phrase
 *  4. flip Client.status → ACTIVE inside a transaction, write the
 *     approval trail, and audit-log the event
 *
 * NO sends, imports, or suppression syncs are triggered.
 */
export async function approveClientLaunch(params: {
  staff: StaffUser;
  clientId: string;
  mode: ClientLaunchApprovalMode;
  confirmationPhrase: string;
  notes?: string;
  /**
   * Test hook — allows injecting a pre-built snapshot so we don't have to
   * stand up the full workspace bundle in unit tests. Production callers
   * leave this undefined so the canonical loader runs.
   */
  snapshotLoader?: (
    clientId: string,
    staff: Pick<StaffUser, "id" | "role">,
    mode: ClientLaunchApprovalMode,
  ) => Promise<LaunchApprovalSnapshot | null>;
}): Promise<ApproveClientLaunchResult> {
  const { staff, clientId } = params;
  const notesRaw = (params.notes ?? "").trim();
  if (notesRaw.length > LAUNCH_APPROVAL_NOTES_MAX) {
    return {
      ok: false,
      code: "NOTES_TOO_LONG",
      message: `Notes must be ${String(LAUNCH_APPROVAL_NOTES_MAX)} characters or fewer.`,
    };
  }

  if (!OPERATOR_SELECTABLE_APPROVAL_MODES.includes(params.mode)) {
    return {
      ok: false,
      code: "MODE_NOT_ALLOWED",
      message:
        "This approval mode is not available yet. Only CONTROLLED_INTERNAL is supported today.",
    };
  }

  const confirmationInput = params.confirmationPhrase;
  if (!confirmationInput || confirmationInput.trim() !== "APPROVE LAUNCH") {
    return {
      ok: false,
      code: "CONFIRMATION_INVALID",
      message: 'Type "APPROVE LAUNCH" exactly to confirm.',
    };
  }

  const snapshot = await (
    params.snapshotLoader ?? loadClientLaunchApprovalSnapshot
  )(clientId, staff, params.mode);
  if (!snapshot) {
    return {
      ok: false,
      code: "NOT_FOUND",
      message: "Client not found or access denied.",
    };
  }
  if (!snapshot.canMutate) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: "You do not have permission to approve this client's launch.",
    };
  }
  if (snapshot.clientStatus === "ACTIVE") {
    return {
      ok: false,
      code: "ALREADY_ACTIVE",
      message: "Client is already ACTIVE.",
    };
  }
  if (!snapshot.policy.canApprove) {
    return {
      ok: false,
      code: "POLICY_BLOCKED",
      message: "Launch cannot be approved while blockers remain.",
      blockers: snapshot.policy.blockers,
    };
  }

  const approvedAt = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.client.update({
        where: { id: clientId },
        data: {
          status: "ACTIVE",
          launchApprovedAt: approvedAt,
          launchApprovedByStaffUserId: staff.id,
          launchApprovalMode: params.mode,
          launchApprovalNotes: notesRaw.length > 0 ? notesRaw : null,
          launchApprovalChecklist: snapshot.policy.checklist as never,
        },
      });

      await tx.auditLog.create({
        data: {
          staffUserId: staff.id,
          clientId,
          action: "UPDATE",
          entityType: "Client.launchApproval",
          entityId: clientId,
          metadata: {
            event: "client_launch_approved",
            mode: params.mode,
            approvedAt: approvedAt.toISOString(),
            checklist: snapshot.policy.checklist,
            warnings: snapshot.policy.warnings,
            notesLength: notesRaw.length,
          },
        },
      });
    });
  } catch (error) {
    return {
      ok: false,
      code: "UNKNOWN_ERROR",
      message:
        error instanceof Error
          ? error.message
          : "Failed to record launch approval.",
    };
  }

  return {
    ok: true,
    clientId,
    launchApprovedAt: approvedAt.toISOString(),
    mode: params.mode,
  };
}
