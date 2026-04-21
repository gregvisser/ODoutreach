/**
 * PR D4d — Sequence launch-readiness rail (records-only).
 *
 * Pure policy layer that evaluates whether a `ClientEmailSequence` is
 * ready to launch. NO sending happens here — readiness is a UI /
 * operator-visibility construct. Sending wiring lands in PR D4e. The
 * same helper is reused by the Outreach page rail and (lightly) by
 * the client overview launch-readiness row.
 *
 * Design goals:
 *   * Zero DB access — this file is a pure reducer from a snapshot.
 *   * Deterministic: the same input produces the same result (ordered
 *     checks, stable ids).
 *   * Honest severity: `blocker` stops launch; `warning` is surfaced
 *     but does not block. Future send-path gates (D4e) will re-check
 *     every blocker at execution time.
 */

import { extractPlaceholders } from "@/lib/email-templates/placeholders";

export type SequenceLaunchCheckId =
  | "sequence_exists"
  | "sequence_approved"
  | "contact_list_attached"
  | "introduction_template_approved"
  | "all_step_templates_approved"
  | "unsubscribe_placeholder_present"
  | "enrollment_records_exist"
  | "pending_email_sendable_recipients"
  | "connected_sending_mailbox"
  | "daily_capacity_available"
  | "sequence_not_launched";

export type SequenceLaunchCheckSeverity = "blocker" | "warning" | "ok";

export type SequenceLaunchCheckResult = {
  id: SequenceLaunchCheckId;
  label: string;
  severity: SequenceLaunchCheckSeverity;
  status: "pass" | "fail";
  /** Short human hint shown under the check label. */
  detail: string;
};

export type SequenceLaunchReadinessSnapshotInput = {
  /** Sequence row. `null` when the target id is not found or out of
   * scope — used to model "sequence was deleted" defensively. */
  sequence: {
    id: string;
    clientId: string;
    status: "DRAFT" | "READY_FOR_REVIEW" | "APPROVED" | "ARCHIVED";
    /** If sending has already started for this sequence (future:
     * there's a `ClientEmailSequenceRun` row in `RUNNING` or later).
     * D4d always passes `false` — there is no launch yet. */
    hasAlreadyLaunched: boolean;
  } | null;
  contactList: {
    id: string;
    memberCount: number;
    emailSendableCount: number;
    /**
     * PR F2: members that are NOT suppressed and have at least one
     * non-email identifier but NO email. Purely informational — never
     * counted toward email-sendable recipients. When a list consists
     * only of `valid_no_email` contacts the rail will still block
     * launch, but the detail text now calls that out explicitly so the
     * operator knows *why* the list isn't sendable.
     */
    missingEmailCount?: number;
  } | null;
  steps: ReadonlyArray<{
    category:
      | "INTRODUCTION"
      | "FOLLOW_UP_1"
      | "FOLLOW_UP_2"
      | "FOLLOW_UP_3"
      | "FOLLOW_UP_4"
      | "FOLLOW_UP_5";
    template: {
      id: string;
      status: "DRAFT" | "READY_FOR_REVIEW" | "APPROVED" | "ARCHIVED";
      subject: string;
      content: string;
    };
  }>;
  enrollment: {
    /** Total enrollment rows of any status. */
    total: number;
    counts: {
      PENDING: number;
      PAUSED: number;
      COMPLETED: number;
      EXCLUDED: number;
    };
    /** Members of the target list that are not yet enrolled AND are
     * currently email-sendable. The rail treats a positive value as
     * "you can still enroll recipients today". */
    newlyEnrollableEmailSendable: number;
  };
  mailbox: {
    connectedSendingCount: number;
    aggregateRemainingToday: number;
  };
};

export type SequenceLaunchReadiness = {
  canLaunch: boolean;
  totalBlockers: number;
  totalWarnings: number;
  checks: SequenceLaunchCheckResult[];
};

const SEQUENCE_NOT_LAUNCHED_STILL_HELD_LABEL =
  "Sequence has not already launched";

function pass(
  id: SequenceLaunchCheckId,
  label: string,
  detail: string,
  severity: SequenceLaunchCheckSeverity = "ok",
): SequenceLaunchCheckResult {
  return { id, label, severity, status: "pass", detail };
}

function fail(
  id: SequenceLaunchCheckId,
  label: string,
  detail: string,
  severity: SequenceLaunchCheckSeverity,
): SequenceLaunchCheckResult {
  return { id, label, severity, status: "fail", detail };
}

/**
 * Evaluate launch readiness for a single sequence. The caller is
 * responsible for assembling the snapshot from DB rows; this helper
 * is the single source of truth for the check set.
 */
export function evaluateSequenceLaunchReadiness(
  input: SequenceLaunchReadinessSnapshotInput,
): SequenceLaunchReadiness {
  const checks: SequenceLaunchCheckResult[] = [];

  // 1. Sequence exists
  if (!input.sequence) {
    checks.push(
      fail(
        "sequence_exists",
        "Sequence exists",
        "Sequence could not be loaded — refresh the page.",
        "blocker",
      ),
    );
    return toReadiness(checks);
  }
  checks.push(
    pass("sequence_exists", "Sequence exists", "Loaded from database."),
  );

  // 2. Sequence approved
  if (input.sequence.status === "APPROVED") {
    checks.push(
      pass(
        "sequence_approved",
        "Sequence approved",
        "OpensDoors staff has signed off on this sequence.",
      ),
    );
  } else {
    checks.push(
      fail(
        "sequence_approved",
        "Sequence approved",
        `Sequence status is ${input.sequence.status} — approve it before launch.`,
        "blocker",
      ),
    );
  }

  // 3. Contact list attached
  if (input.contactList) {
    const missingEmailCount = input.contactList.missingEmailCount ?? 0;
    const noEmailHint =
      missingEmailCount > 0
        ? ` (${String(missingEmailCount)} with no email on file)`
        : "";
    checks.push(
      pass(
        "contact_list_attached",
        "Target contact list attached",
        `List has ${String(input.contactList.memberCount)} member(s), ${String(input.contactList.emailSendableCount)} email-sendable${noEmailHint}.`,
      ),
    );
  } else {
    checks.push(
      fail(
        "contact_list_attached",
        "Target contact list attached",
        "Sequence has no contact list attached.",
        "blocker",
      ),
    );
  }

  // 4. Introduction template approved
  const introStep = input.steps.find((s) => s.category === "INTRODUCTION");
  if (introStep && introStep.template.status === "APPROVED") {
    checks.push(
      pass(
        "introduction_template_approved",
        "Introduction template approved",
        "Introduction step uses an APPROVED template.",
      ),
    );
  } else if (!introStep) {
    checks.push(
      fail(
        "introduction_template_approved",
        "Introduction template approved",
        "Sequence has no introduction step.",
        "blocker",
      ),
    );
  } else {
    checks.push(
      fail(
        "introduction_template_approved",
        "Introduction template approved",
        `Introduction template is ${introStep.template.status}.`,
        "blocker",
      ),
    );
  }

  // 5. All step templates approved
  const unapprovedStepCount = input.steps.filter(
    (s) => s.template.status !== "APPROVED",
  ).length;
  if (input.steps.length === 0) {
    checks.push(
      fail(
        "all_step_templates_approved",
        "Every step template approved",
        "Sequence has no steps.",
        "blocker",
      ),
    );
  } else if (unapprovedStepCount === 0) {
    checks.push(
      pass(
        "all_step_templates_approved",
        "Every step template approved",
        `${String(input.steps.length)} step(s) all APPROVED.`,
      ),
    );
  } else {
    checks.push(
      fail(
        "all_step_templates_approved",
        "Every step template approved",
        `${String(unapprovedStepCount)} step(s) use non-APPROVED templates.`,
        "blocker",
      ),
    );
  }

  // 6. Unsubscribe placeholder present (at least one required slot).
  // Rail policy: every APPROVED step template must render
  // `{{unsubscribe_link}}` somewhere in subject/content. If any step is
  // missing it we downgrade to a blocker — we want an unsubscribe path
  // guaranteed at every hop, not just the first email. Non-APPROVED
  // templates are skipped because the approval check above already
  // surfaced them.
  const approvedSteps = input.steps.filter(
    (s) => s.template.status === "APPROVED",
  );
  if (approvedSteps.length === 0) {
    checks.push(
      fail(
        "unsubscribe_placeholder_present",
        "Unsubscribe placeholder present",
        "No approved step templates to check.",
        "warning",
      ),
    );
  } else {
    const stepsMissingUnsub = approvedSteps.filter((s) => {
      const tokens = extractPlaceholders(
        s.template.subject ?? "",
        s.template.content ?? "",
      );
      return !tokens.unique.includes("unsubscribe_link");
    });
    if (stepsMissingUnsub.length === 0) {
      checks.push(
        pass(
          "unsubscribe_placeholder_present",
          "Unsubscribe placeholder present",
          "Every approved step template includes {{unsubscribe_link}}.",
        ),
      );
    } else {
      checks.push(
        fail(
          "unsubscribe_placeholder_present",
          "Unsubscribe placeholder present",
          `${String(stepsMissingUnsub.length)} approved step(s) missing {{unsubscribe_link}}.`,
          "blocker",
        ),
      );
    }
  }

  // 7. Enrollment records exist OR can be created
  const hasEnrollments = input.enrollment.total > 0;
  const canEnrollMore = input.enrollment.newlyEnrollableEmailSendable > 0;
  if (hasEnrollments || canEnrollMore) {
    checks.push(
      pass(
        "enrollment_records_exist",
        "Enrollment records exist (or can be created)",
        hasEnrollments
          ? `${String(input.enrollment.total)} enrollment row(s) on file.`
          : `No enrollments yet — ${String(input.enrollment.newlyEnrollableEmailSendable)} contact(s) ready to enroll.`,
      ),
    );
  } else {
    checks.push(
      fail(
        "enrollment_records_exist",
        "Enrollment records exist (or can be created)",
        "No enrollments and no email-sendable contacts to enroll.",
        "blocker",
      ),
    );
  }

  // 8. At least 1 PENDING email-sendable recipient
  //
  // Approximation for records-only: a PENDING enrollment implies the
  // recipient was email-sendable at enrollment time. Suppression is
  // re-checked at execution time (PR D4e). If there are zero PENDING
  // rows but there ARE newly-enrollable contacts, the rail surfaces it
  // as a warning so the operator enrolls before launching.
  const pending = input.enrollment.counts.PENDING;
  if (pending > 0) {
    checks.push(
      pass(
        "pending_email_sendable_recipients",
        "Pending email-sendable recipient(s)",
        `${String(pending)} PENDING enrollment row(s).`,
      ),
    );
  } else if (canEnrollMore) {
    checks.push(
      fail(
        "pending_email_sendable_recipients",
        "Pending email-sendable recipient(s)",
        "No PENDING enrollments yet — create enrollment records first.",
        "blocker",
      ),
    );
  } else {
    // PR F2: when the attached list exists but every member is either
    // suppressed / missing email / missing identifier, be explicit so the
    // operator knows a "0 pending" rail is not a records bug — it's a
    // pipeline-shape issue (valid-no-email contacts cannot launch a send).
    const missingEmailCount = input.contactList?.missingEmailCount ?? 0;
    const detail =
      missingEmailCount > 0
        ? `No PENDING enrollments; list has no email-sendable contacts (${String(missingEmailCount)} with no email on file).`
        : "No PENDING enrollments and no email-sendable contacts left to enroll.";
    checks.push(
      fail(
        "pending_email_sendable_recipients",
        "Pending email-sendable recipient(s)",
        detail,
        "blocker",
      ),
    );
  }

  // 9. Connected sending mailbox
  if (input.mailbox.connectedSendingCount >= 1) {
    checks.push(
      pass(
        "connected_sending_mailbox",
        "At least one connected sending mailbox",
        `${String(input.mailbox.connectedSendingCount)} mailbox(es) connected and eligible.`,
      ),
    );
  } else {
    checks.push(
      fail(
        "connected_sending_mailbox",
        "At least one connected sending mailbox",
        "Connect a sending mailbox in Mailboxes before launch.",
        "blocker",
      ),
    );
  }

  // 10. Available daily capacity > 0
  if (input.mailbox.aggregateRemainingToday > 0) {
    checks.push(
      pass(
        "daily_capacity_available",
        "Mailbox pool capacity available today",
        `${String(input.mailbox.aggregateRemainingToday)} slot(s) remaining in UTC day.`,
      ),
    );
  } else {
    checks.push(
      fail(
        "daily_capacity_available",
        "Mailbox pool capacity available today",
        "No remaining mailbox capacity in the UTC day.",
        "blocker",
      ),
    );
  }

  // 11. Sequence has not already launched
  if (input.sequence.hasAlreadyLaunched) {
    checks.push(
      fail(
        "sequence_not_launched",
        SEQUENCE_NOT_LAUNCHED_STILL_HELD_LABEL,
        "This sequence already started sending — use pause/resume instead.",
        "blocker",
      ),
    );
  } else {
    checks.push(
      pass(
        "sequence_not_launched",
        SEQUENCE_NOT_LAUNCHED_STILL_HELD_LABEL,
        "No send run has started yet.",
      ),
    );
  }

  return toReadiness(checks);
}

function toReadiness(
  checks: SequenceLaunchCheckResult[],
): SequenceLaunchReadiness {
  const blockers = checks.filter(
    (c) => c.status === "fail" && c.severity === "blocker",
  ).length;
  const warnings = checks.filter(
    (c) => c.status === "fail" && c.severity === "warning",
  ).length;
  return {
    canLaunch: blockers === 0,
    totalBlockers: blockers,
    totalWarnings: warnings,
    checks,
  };
}

export const LAUNCH_CHECK_DISPLAY_ORDER: readonly SequenceLaunchCheckId[] = [
  "sequence_exists",
  "sequence_approved",
  "contact_list_attached",
  "introduction_template_approved",
  "all_step_templates_approved",
  "unsubscribe_placeholder_present",
  "enrollment_records_exist",
  "pending_email_sendable_recipients",
  "connected_sending_mailbox",
  "daily_capacity_available",
  "sequence_not_launched",
];
