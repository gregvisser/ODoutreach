import { SEQUENCE_INTRODUCTION_BATCH_CAP } from "@/lib/controlled-pilot-constants";

/**
 * Stable internal marker emitted by the step-send snapshot when a recipient is
 * still flagged "client not active" BUT the client has since gone live. The
 * recipient row was checked before activation and just needs a refresh — it is
 * NOT an onboarding gap. Surfaced as friendly copy below; never shown raw.
 */
export const STALE_RECIPIENTS_CLIENT_NOW_LIVE_REASON =
  "stale_recipients_client_now_live";

/** Friendly copy for {@link STALE_RECIPIENTS_CLIENT_NOW_LIVE_REASON}. */
export const STALE_RECIPIENTS_CLIENT_NOW_LIVE_COPY =
  "These recipients were checked before this client went live. Open Review recipients to update who can send, then launch.";

/**
 * Maps internal / server snapshot reasons to short staff-facing copy for Outreach.
 */
export function humanizeSequenceLaunchDisabledReason(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim();
  // Client is now live, but recipients carry a pre-activation "not active"
  // flag — guide to a refresh, NOT back to onboarding. Checked before the
  // generic client-inactive branch so the live case wins.
  if (s === STALE_RECIPIENTS_CLIENT_NOW_LIVE_REASON) {
    return STALE_RECIPIENTS_CLIENT_NOW_LIVE_COPY;
  }
  // Governance gate codes — never surface raw "blocked_*" strings to staff.
  if (/blocked_client_inactive/i.test(s) || (/Client is/i.test(s) && /not ACTIVE/i.test(s))) {
    return "This client isn't live yet. Finish the onboarding sections on the client overview page — the client activates automatically when every section is ready.";
  }
  if (/blocked_launch_approval_required/i.test(s)) {
    return "This client still needs to finish onboarding before sequences can launch.";
  }
  if (/blocked_live_mode_not_enabled/i.test(s)) {
    return "Live sending isn't enabled for this client yet.";
  }
  if (/blocked_unsubscribe_required/i.test(s)) {
    return "An unsubscribe link is required before this sequence can send.";
  }
  if (/blocked_allowlist/i.test(s)) {
    return "Sending is restricted to allowlisted recipients right now.";
  }
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
    return "No recipients are ready to send for this sequence right now. Open Review recipients to see why — they may already be enrolled in another sequence, suppressed, or missing an email address.";
  }
  if (/Review recipients to refresh/i.test(s) || /refresh the launch batch/i.test(s)) {
    return "No recipients are ready to send right now. Open Review recipients to see why — they may already be enrolled in another sequence, suppressed, or missing an email address.";
  }
  if (/prepare send rows|prepare send records|send rows/i.test(s)) {
    return "No eligible recipients yet. Open Review recipients to add or refresh the contacts for this sequence.";
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
