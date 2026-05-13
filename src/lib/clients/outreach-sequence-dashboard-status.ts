import type { ClientEmailSequenceStatus } from "@/generated/prisma/enums";
import type { SequenceLaunchReadiness } from "@/lib/email-sequences/launch-readiness";

/**
 * Staff-facing status for the Outreach sequence table and selected panel.
 * Derives labels from lifecycle + launch readiness + intro prep counts — DB enums unchanged.
 */
export type PrepCountsSlice = {
  ready: number;
  blocked: number;
  suppressed: number;
  sent: number;
  failed: number;
};

export function deriveOutreachDashboardStatusLabel(args: {
  status: ClientEmailSequenceStatus;
  launchReadiness: SequenceLaunchReadiness | null;
  /** INTRODUCTION prep snapshot for this sequence, if any. */
  prepCounts: PrepCountsSlice | null;
  /** Sum of PENDING enrollments on the sequence (from enrollment summary). */
  enrollmentPending: number;
}): string {
  const { status, launchReadiness, prepCounts, enrollmentPending } = args;

  if (status === "ARCHIVED") return "Archived";
  if (status === "DRAFT") return "Draft";
  if (status === "READY_FOR_REVIEW") return "Ready";

  if (status === "APPROVED") {
    if (launchReadiness && !launchReadiness.canLaunch) return "Blocked";

    const sent = prepCounts?.sent ?? 0;
    const ready = prepCounts?.ready ?? 0;

    if (sent > 0 && ready > 0) return "Sending";
    if (sent > 0 && ready === 0 && enrollmentPending === 0) return "Completed";
    if (sent > 0 && ready === 0) return "Sending";

    return "Ready";
  }

  return status;
}
