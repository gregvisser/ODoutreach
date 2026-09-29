import {
  isDispatchHoldReason,
  isHardStopHoldReason,
} from "@/lib/clients/outreach-sequence-send-staff-copy";

/**
 * A READY row the scheduler may send again without a staff launch.
 *
 * True only for a pacing, calendar, capacity, fair-share, or corporate
 * release hold. Hard stops — suppression, do-not-contact, unsubscribe,
 * bounce, reply-stop, pause, and a disconnected mailbox — stay held even
 * when the sentence also mentions pacing.
 */
export function isPacingAutoResumeRow(input: {
  status: string;
  blockedReason: string | null | undefined;
  outboundEmailId: string | null;
}): boolean {
  if (input.status !== "READY") return false;
  if (input.outboundEmailId) return false;
  if (isHardStopHoldReason(input.blockedReason)) return false;
  return isDispatchHoldReason(input.blockedReason);
}
