import "server-only";

import { mailboxDailySendCap } from "@/lib/mailbox-identities";
import type { ClientSendingWindow } from "@/lib/mailboxes/sending-calendar-history";
import { loadClientSendingWindow } from "@/server/mailbox/client-sending-calendar";
import { mailboxIneligibleReasonFromStaticState } from "@/server/mailbox/sending-policy";
import { prisma } from "@/lib/db";
import type { ClientMailboxIdentity } from "@/generated/prisma/client";

export type MailboxSendingReadiness = {
  mailboxId: string;
  /** Compatibility field name: RESERVED + CONSUMED in the effective sending day. */
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
 * Uses the same local/transition window as the reservation ledger and dispatch.
 */
export async function getMailboxSendingReadinessForClient(
  clientId: string,
  mailboxes: ClientMailboxIdentity[],
  context?: { at: Date; window: ClientSendingWindow },
): Promise<MailboxSendingReadiness[]> {
  if (mailboxes.length === 0) {
    return [];
  }

  const at = context?.at ?? new Date();
  const windowKey = (context?.window ?? await loadClientSendingWindow(clientId, at)).key;

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
    const c = mailboxDailySendCap(m.dailySendCap);
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
