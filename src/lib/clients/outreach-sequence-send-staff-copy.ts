import { SEQUENCE_INTRODUCTION_BATCH_CAP } from "@/lib/controlled-pilot-constants";

/**
 * Maps internal / server snapshot reasons to short staff-facing copy for Outreach.
 */
export function humanizeSequenceLaunchDisabledReason(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim();
  if (/not APPROVED/i.test(s) && /Sequence is/i.test(s)) {
    return "This sequence is not activated for sending yet. Save again, or open Templates if an email still needs approval.";
  }
  if (/template is .* not APPROVED/i.test(s)) {
    return "Open Templates and finish this email template before launching.";
  }
  if (/missing an email address/i.test(s)) {
    return "No eligible recipients — some prepared rows are missing an email address.";
  }
  if (/No eligible recipients/i.test(s) && /launch batch/i.test(s)) {
    return "No eligible recipients yet — review recipients, suppression, or mailbox capacity.";
  }
  if (/Review recipients to refresh/i.test(s)) {
    return "Review recipients to refresh the launch batch.";
  }
  if (/Previous step/i.test(s) && /SENT/i.test(s)) {
    return "The previous step must finish sending before this step can go out.";
  }
  if (/Delay .* has not elapsed/i.test(s)) {
    return "The scheduled wait between steps has not finished yet for eligible recipients.";
  }
  return s;
}

export function sequenceIntroductionBatchLimitCopy(hardCap: number): string {
  const cap = hardCap > 0 ? hardCap : SEQUENCE_INTRODUCTION_BATCH_CAP;
  return `This launch sends up to ${String(cap)} emails now. Remaining eligible recipients stay queued for later batches within daily mailbox limits.`;
}

/**
 * Short paragraph for the live sequence launch panel. Kept in one place
 * so unit tests can assert we do not surface internal-domain wording.
 */
export const LIVE_SEQUENCE_LAUNCH_INTRO_HELP =
  "Sends use your connected mailboxes, daily limits, and suppression rules. Eligibility is re-checked when you launch.";

export const LIVE_SEQUENCE_LAUNCH_FOLLOW_HELP =
  "Sends one step at a time. Eligibility, delays, and suppression are re-checked when you launch.";
