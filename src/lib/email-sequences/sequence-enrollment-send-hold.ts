import type {
  ClientEmailSequenceEnrollmentStatus,
  ClientEmailSequenceStepSendStatus,
} from "@/generated/prisma/enums";

/**
 * A linked reply marks the enrolment COMPLETED. Pause and exclusion are the
 * other states that must not still deliver a follow-up that was queued earlier.
 * PENDING is the only status that may still send.
 */
export function sequenceEnrollmentBlocksQueuedSend(
  status: ClientEmailSequenceEnrollmentStatus | null | undefined,
): boolean {
  return status === "COMPLETED" || status === "PAUSED" || status === "EXCLUDED";
}

/**
 * Dispatch-time guard for a step-send row linked to this outbound. A stopped
 * enrolment must not send a follow-up that is still PLANNED/READY/BLOCKED/FAILED,
 * but must not block unrelated mail or an intro row whose step-send is already
 * SENT (provider reconciliation / non-sequence unit fixtures).
 */
export function sequenceEnrollmentBlocksDispatchForStepSend(
  enrollmentStatus: ClientEmailSequenceEnrollmentStatus | null | undefined,
  stepSendStatus: ClientEmailSequenceStepSendStatus | null | undefined,
): boolean {
  if (!sequenceEnrollmentBlocksQueuedSend(enrollmentStatus)) return false;
  if (
    stepSendStatus == null ||
    stepSendStatus === "SENT" ||
    stepSendStatus === "SKIPPED" ||
    stepSendStatus === "SUPPRESSED"
  ) {
    return false;
  }
  return true;
}

export const REPLY_STOPPED_FOLLOWUP_CODE = "REPLY_STOPPED_FOLLOWUP";
export const REPLY_STOPPED_FOLLOWUP_MESSAGE =
  "A reply arrived on this sequence, so this follow-up was not sent.";

export const SEQUENCE_ENROLLMENT_STOPPED_CODE = "SEQUENCE_ENROLLMENT_STOPPED";
export const SEQUENCE_ENROLLMENT_STOPPED_MESSAGE =
  "This recipient's sequence is paused, finished, or stopped, so this email was not sent.";
