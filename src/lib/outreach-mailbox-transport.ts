import "server-only";

import { normalizeEmail } from "@/lib/normalize";

/**
 * Minimal mailbox row shape to decide whether *client* outreach can use the
 * workspace mailbox pool (Graph/Gmail) vs legacy ESP (mock/Resend on rows
 * with no `mailboxIdentityId` in `executeOutboundSend`).
 */
export type MailboxOutreachRowInput = {
  isActive: boolean;
  connectionStatus: string;
  canSend: boolean;
  isSendingEnabled: boolean;
  email: string;
};

/**
 * In-app eligibility mirrors `isMailboxExecutionEligible` (connection + send
 * flags only — not daily cap, which is enforced at send time).
 */
function isMailboxRowEligible(m: MailboxOutreachRowInput): boolean {
  if (!m.isActive) return false;
  if (m.connectionStatus !== "CONNECTED") return false;
  if (!m.canSend) return false;
  if (!m.isSendingEnabled) return false;
  return true;
}

export function summarizeOutreachMailboxes(
  mailboxes: MailboxOutreachRowInput[] | null | undefined,
) {
  const rows = mailboxes?.filter(Boolean) ?? [];
  const hasAny = rows.length > 0;
  const eligible = rows.filter(isMailboxRowEligible);
  const hasMailboxNativePath = eligible.length > 0;
  const firstEligibleEmail = hasMailboxNativePath
    ? (eligible[0]?.email?.trim() || null)
    : null;
  return {
    hasAnyMailboxRow: hasAny,
    eligibleCount: eligible.length,
    hasMailboxNativeOutreachPath: hasMailboxNativePath,
    firstEligibleMailboxEmail: firstEligibleEmail
      ? normalizeEmail(firstEligibleEmail)
      : null,
  } as const;
}
