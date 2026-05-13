import { CONTROLLED_PILOT_HARD_MAX_RECIPIENTS } from "@/lib/controlled-pilot-constants";

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
  if (/GOVERNED_TEST_EMAIL_DOMAINS/i.test(s) || /governed domain allowlist/i.test(s)) {
    return "Mailbox and domain safety rules are blocking these recipients for this environment.";
  }
  if (/No eligible recipients pass/i.test(s)) {
    return "No eligible recipients are in this launch batch yet — review recipients or check the test-domain safety list.";
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
  const cap = hardCap > 0 ? hardCap : CONTROLLED_PILOT_HARD_MAX_RECIPIENTS;
  return `Send limit: each launch sends up to ${String(cap)} emails in one batch. Remaining eligible recipients stay queued for later batches within daily mailbox limits.`;
}
