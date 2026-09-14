import type { ClientEmailSequenceStatus } from "@/generated/prisma/enums";
import type { SequenceDeliverySummary } from "./sequence-delivery-summary";
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
  /** Current linked outbound outcomes, never inferred from planner SENT. */
  delivery?: SequenceDeliverySummary;
}): string {
  const { status, launchReadiness, prepCounts } = args;

  if (status === "ARCHIVED") return "Archived";
  if (status === "DRAFT") return "Draft";
  if (status === "READY_FOR_REVIEW") return "Ready";

  if (status === "APPROVED") {
    const sent = args.delivery?.sent ?? 0;
    const ready = prepCounts?.ready ?? 0;
    const blocked = prepCounts?.blocked ?? 0;

    if ((args.delivery?.attention ?? 0) > 0) return "Needs attention";
    if (!args.delivery && (prepCounts?.sent ?? 0) > 0) return "Check delivery";
    if ((args.delivery?.queued ?? 0) > 0) return "Queued";
    if ((prepCounts?.failed ?? 0) > 0 || blocked > 0) return "Blocked";
    if (sent > 0 && ready === 0) return "Sent";
    if (sent > 0 && ready > 0) return "Partly sent";

    if (launchReadiness && !launchReadiness.canLaunch) {
      // Distinguish a genuine configuration problem (no mailbox, missing
      // template/unsubscribe, etc.) from the benign "there's simply
      // nobody to send to right now" case. The latter is usually because
      // every eligible contact has already been emailed or is inside the
      // 10-day outreach cooldown — that is NOT broken, so it must not show
      // the alarming red "Blocked" pill.
      const activeBlockers = launchReadiness.checks.filter(
        (c) => c.status === "fail" && c.severity === "blocker",
      );
      const onlyNoRecipients =
        activeBlockers.length > 0 &&
        activeBlockers.every(
          (c) => c.id === "pending_email_sendable_recipients",
        );
      if (onlyNoRecipients) return "No recipients ready";
      return "Blocked";
    }

    return "Ready";
  }

  return status;
}
