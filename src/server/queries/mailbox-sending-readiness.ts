import "server-only";

import { DEFAULT_MAILBOX_DAILY_SEND_CAP } from "@/lib/mailbox-identities";
import { utcDateKeyForInstant } from "@/lib/sending-window";
import { mailboxIneligibleReasonFromStaticState } from "@/server/mailbox/sending-policy";
import { prisma } from "@/lib/db";
import type { ClientMailboxIdentity } from "@/generated/prisma/client";

export type MailboxSendingReadiness = {
  mailboxId: string;
  /** Count of RESERVED + CONSUMED in the current UTC day window. */
  bookedInUtcDay: number;
  cap: number;
  remaining: number;
  eligible: boolean;
  ineligibleCode: string | null;
  /** True when live ledger (not the stale identity counter) blocks sending. */
  atLedgerCap: boolean;
};

/**
 * Per-mailbox sending status for the operator UI (no outbound provider calls).
 * Daily window: UTC calendar day, aligned with the reservation ledger.
 */
export async function getMailboxSendingReadinessForClient(
  clientId: string,
  mailboxes: ClientMailboxIdentity[],
): Promise<MailboxSendingReadiness[]> {
  if (mailboxes.length === 0) {
    return [];
  }

  const at = new Date();
  const windowKey = utcDateKeyForInstant(at);

  const group = await prisma.mailboxSendReservation.groupBy({
    by: ["mailboxIdentityId"],
    where: {
      clientId,
      windowKey,
      status: { in: ["RESERVED", "CONSUMED"] },
    },
    _count: { _all: true },
  });
  const booked = new Map<string, number>();
  for (const g of group) {
    booked.set(g.mailboxIdentityId, g._count._all);
  }

  return mailboxes.map((m) => {
    const c = Math.max(1, m.dailySendCap || DEFAULT_MAILBOX_DAILY_SEND_CAP);
    const b = booked.get(m.id) ?? 0;
    const staticReason = mailboxIneligibleReasonFromStaticState(
      m,
      at,
      m.dailyWindowResetAt,
      m.dailySendCap,
      m.emailsSentToday,
    );
    const connectionReason =
      staticReason === "daily_send_cap_reached_stale_counter" ? null : staticReason;
    const atLedgerCap = b >= c;
    const ineligibleCode: string | null =
      connectionReason ?? (atLedgerCap ? "daily_ledger_cap_reached" : null);
    const eligible = !connectionReason && b < c;

    return {
      mailboxId: m.id,
      bookedInUtcDay: b,
      cap: c,
      remaining: Math.max(0, c - b),
      eligible,
      ineligibleCode,
      atLedgerCap,
    };
  });
}
