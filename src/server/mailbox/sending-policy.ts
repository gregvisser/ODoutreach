import "server-only";

import { DEFAULT_MAILBOX_DAILY_SEND_CAP } from "@/lib/mailbox-identities";
import { isMailboxRemovedFromWorkspace } from "@/lib/mailbox-workspace-removal";
import { utcDateKeyForInstant } from "@/lib/sending-window";
import { prisma } from "@/lib/db";
import type { Prisma, ClientMailboxIdentity, MailboxConnectionStatus } from "@/generated/prisma/client";

// Re-export for tests
export { utcDateKeyForInstant } from "@/lib/sending-window";

export type SendingMailboxResolve =
  | { mode: "legacy" }
  | { mode: "governed"; mailbox: ClientMailboxIdentity }
  | { mode: "ineligible"; reason: string; mailbox?: ClientMailboxIdentity };

const ACTIVE_LEDGER_STATUS = ["RESERVED", "CONSUMED"] as const;

/**
 * For worker execution: caller already holds a ledger reservation — do not block on
 * the mailbox's possibly stale per-day counter; only on connectivity / send gates.
 */
export function mailboxIneligibleForGovernedSendExecution(m: {
  isActive: boolean;
  connectionStatus: MailboxConnectionStatus;
  canSend: boolean;
  isSendingEnabled: boolean;
  workspaceRemovedAt?: Date | null;
}): string | null {
  if (isMailboxRemovedFromWorkspace(m)) return "mailbox_removed_from_workspace";
  if (!m.isActive) return "inactive_mailbox";
  if (m.connectionStatus !== "CONNECTED") return "mailbox_not_connected";
  if (!m.canSend) return "sending_not_allowed_for_mailbox";
  if (!m.isSendingEnabled) return "sending_disabled";
  return null;
}

/** True when this identity may participate in governed / pilot sends (connection + send toggles only). */
export function isMailboxExecutionEligible(m: {
  isActive: boolean;
  connectionStatus: MailboxConnectionStatus;
  canSend: boolean;
  isSendingEnabled: boolean;
  workspaceRemovedAt?: Date | null;
}): boolean {
  return mailboxIneligibleForGovernedSendExecution(m) === null;
}

/**
 * Workspace-based mailbox access rule (shared by sequence + controlled pilot sends).
 *
 * An authorised operator for a client workspace may use **any** connected
 * sending mailbox on that workspace — eligibility is mailbox-specific
 * (connection status, `canSend`, `isSendingEnabled`, `isActive`, ledger
 * cap, suppression, signature), never operator-specific. This helper is
 * the single labelled place where the filter lives so future contributors
 * cannot accidentally reintroduce operator-email / mailbox-owner scoping.
 *
 * What is NOT here (intentionally):
 *   - signed-in staff email
 *   - `StaffUser.id` or any operator identity
 *   - mailbox `createdByStaffUserId` / "owner" predicates
 *
 * What callers still enforce outside this helper:
 *   - `requireClientAccess(staff, clientId)` — workspace authorisation
 *   - `requireClientEmailSequenceMutator` / `requireClientMailboxMutator`
 *     — role/membership gating for sending or managing
 *   - per-recipient suppression + audit trail
 *   - reply path: mailbox is the **receiving** mailbox for the thread,
 *     not the operator's personal mailbox
 */
export function eligibleWorkspaceMailboxPool(
  rows: ClientMailboxIdentity[],
): ClientMailboxIdentity[] {
  return rows.filter(
    (m) => mailboxIneligibleForGovernedSendExecution(m) === null,
  );
}

export function mailboxIneligibleReasonFromStaticState(
  m: {
    isActive: boolean;
    connectionStatus: MailboxConnectionStatus;
    canSend: boolean;
    isSendingEnabled: boolean;
    workspaceRemovedAt?: Date | null;
  },
  now: Date,
  dailyWindowResetAt: Date | null,
  dailySendCap: number,
  emailsSentToday: number,
): string | null {
  if (isMailboxRemovedFromWorkspace(m)) return "mailbox_removed_from_workspace";
  if (!m.isActive) return "inactive_mailbox";
  if (m.connectionStatus !== "CONNECTED") return "mailbox_not_connected";
  if (!m.canSend) return "sending_not_allowed_for_mailbox";
  if (!m.isSendingEnabled) return "sending_disabled";
  if (!isUnderCounterCap(now, dailyWindowResetAt, dailySendCap, emailsSentToday)) {
    return "daily_send_cap_reached_stale_counter";
  }
  return null;
}

/** Stale-identity field guard only — final cap enforces the ledger. */
function isUnderCounterCap(
  now: Date,
  dailyWindowResetAt: Date | null,
  cap: number,
  emailsSentToday: number,
): boolean {
  const c = Math.max(1, cap);
  if (emailsSentToday <= 0) return true;
  if (!dailyWindowResetAt) return emailsSentToday < c;
  if (now.getTime() >= dailyWindowResetAt.getTime()) return true;
  return emailsSentToday < c;
}

export function resolveSendingGovernance(
  clientHasMailboxRows: boolean,
  picks: { primaryConnected: ClientMailboxIdentity | null; anyConnected: ClientMailboxIdentity | null },
): SendingMailboxResolve {
  if (!clientHasMailboxRows) {
    return { mode: "legacy" };
  }
  const m = picks.primaryConnected ?? picks.anyConnected;
  if (!m) {
    return { mode: "ineligible", reason: "no_connected_sending_mailbox" };
  }
  const staticReason = mailboxIneligibleReasonFromStaticState(
    m,
    new Date(),
    m.dailyWindowResetAt,
    m.dailySendCap,
    m.emailsSentToday,
  );
  if (staticReason === "daily_send_cap_reached_stale_counter") {
    return { mode: "governed", mailbox: m };
  }
  if (staticReason) {
    return { mode: "ineligible", reason: staticReason, mailbox: m };
  }
  return { mode: "governed", mailbox: m };
}

/**
 * Picks: primary+active+connected first, else any active+connected+can send.
 */
export async function loadGovernedSendingMailbox(
  clientId: string,
): Promise<SendingMailboxResolve> {
  const rows = await prisma.clientMailboxIdentity.findMany({
    where: { clientId },
  });

  const canSend = (r: ClientMailboxIdentity) =>
    !isMailboxRemovedFromWorkspace(r) &&
    r.isActive &&
    r.connectionStatus === "CONNECTED" &&
    r.canSend &&
    r.isSendingEnabled;

  const primaryConnected = rows.find((r) => r.isPrimary && canSend(r)) ?? null;
  const anyConnected = primaryConnected ?? (rows.find((r) => canSend(r)) ?? null);

  return resolveSendingGovernance(rows.length > 0, {
    primaryConnected,
    anyConnected,
  });
}

export async function countBookedSendSlotsInUtcWindow(
  tx: Prisma.TransactionClient,
  mailboxIdentityId: string,
  windowKey: string,
): Promise<number> {
  return tx.mailboxSendReservation.count({
    where: {
      mailboxIdentityId,
      windowKey,
      status: { in: [...ACTIVE_LEDGER_STATUS] },
    },
  });
}

export type TryReserveResult =
  | { ok: true; reservationId: string; windowKey: string; duplicate: false }
  | { ok: true; reservationId: string; windowKey: string; duplicate: true; outboundEmailId: null }
  | { ok: false; error: string; errorCode: string; reason: string }
  | {
      ok: true;
      duplicate: true;
      reservationId: string;
      outboundEmailId: string;
      alreadyQueued: true;
    };

/**
 * Reserves a send slot in the current UTC day window, or returns an existing
 * in-flight or completed idempotent key without double-booking a cap slot.
 */
export async function tryReserveSendSlotInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    clientId: string;
    mailbox: ClientMailboxIdentity;
    idempotencyKey: string;
    at: Date;
  },
): Promise<TryReserveResult> {
  const { clientId, mailbox, idempotencyKey, at } = input;
  const windowKey = utcDateKeyForInstant(at);
  const cap = Math.max(1, mailbox.dailySendCap || DEFAULT_MAILBOX_DAILY_SEND_CAP);

  const staticReason = mailboxIneligibleReasonFromStaticState(
    mailbox,
    at,
    mailbox.dailyWindowResetAt,
    mailbox.dailySendCap,
    mailbox.emailsSentToday,
  );
  if (staticReason && !staticReason.startsWith("daily_send_cap_reached_")) {
    return {
      ok: false,
      error: humanMessageForIneligible(staticReason, mailbox),
      errorCode: staticReason,
      reason: staticReason,
    };
  }

  const existing = await tx.mailboxSendReservation.findFirst({
    where: {
      mailboxIdentityId: mailbox.id,
      windowKey,
      idempotencyKey,
    },
  });

  if (existing) {
    if (existing.status === "CONSUMED" && existing.outboundEmailId) {
      return {
        ok: true,
        duplicate: true,
        reservationId: existing.id,
        outboundEmailId: existing.outboundEmailId,
        alreadyQueued: true,
      };
    }
    if (existing.status === "RESERVED") {
      if (existing.outboundEmailId) {
        return {
          ok: true,
          duplicate: true,
          reservationId: existing.id,
          outboundEmailId: existing.outboundEmailId,
          alreadyQueued: true,
        };
      }
      return {
        ok: true,
        reservationId: existing.id,
        windowKey,
        duplicate: true,
        outboundEmailId: null,
      };
    }
    if (existing.status === "RELEASED") {
      return {
        ok: false,
        error: "A prior attempt for this idempotency key is finished. Use a new idempotency key to send again.",
        errorCode: "idempotency_key_released",
        reason: "idempotency_key_released",
      };
    }
  }

  const booked = await countBookedSendSlotsInUtcWindow(tx, mailbox.id, windowKey);
  if (booked >= cap) {
    return {
      ok: false,
      error: `Daily send cap reached for this mailbox (${String(cap)} / UTC day).`,
      errorCode: "MAILBOX_DAILY_CAP",
      reason: "daily_ledger_cap_reached",
    };
  }

  const r = await tx.mailboxSendReservation.create({
    data: {
      clientId,
      mailboxIdentityId: mailbox.id,
      idempotencyKey,
      windowKey,
      status: "RESERVED",
    },
  });
  return {
    ok: true,
    reservationId: r.id,
    windowKey,
    duplicate: false,
  };
}

export function humanizeGovernanceRejection(
  code: string,
  mailbox: ClientMailboxIdentity | null,
): string {
  if (code === "no_connected_sending_mailbox") {
    return "Add and connect an active sending mailbox in this workspace before queuing email.";
  }
  if (!mailbox) {
    return "This workspace is not ready to send from a connected mailbox.";
  }
  return humanMessageForIneligible(code, mailbox);
}

function humanMessageForIneligible(
  code: string,
  mailbox: ClientMailboxIdentity,
): string {
  switch (code) {
    case "inactive_mailbox":
      return `Mailbox ${mailbox.email} is inactive.`;
    case "mailbox_not_connected":
      return `Mailbox ${mailbox.email} is not connected.`;
    case "sending_not_allowed_for_mailbox":
      return `Sending is not enabled for ${mailbox.email}.`;
    case "sending_disabled":
      return `Operator disabled sending for ${mailbox.email}.`;
    case "mailbox_removed_from_workspace":
      return `Mailbox ${mailbox.email} was removed from this workspace.`;
    case "daily_send_cap_reached_stale_counter":
      return "The stored per-mailbox counter may be at cap; the live ledger is enforced when you send.";
    default:
      return "This mailbox is not eligible to send.";
  }
}

export function buildContactSendIdempotencyKey(
  clientId: string,
  contactId: string,
  attemptKey: string,
): string {
  return `contactSend:${clientId}:${contactId}:${attemptKey}`;
}

export async function linkReservationToOutboundInTransaction(
  tx: Prisma.TransactionClient,
  reservationId: string,
  outboundEmailId: string,
) {
  await tx.mailboxSendReservation.update({
    where: { id: reservationId },
    data: { outboundEmailId },
  });
}

export async function recomputeMailboxLedgerCounterInTransaction(
  tx: Prisma.TransactionClient,
  mailboxIdentityId: string,
  at: Date,
) {
  const windowKey = utcDateKeyForInstant(at);
  const c = await countBookedSendSlotsInUtcWindow(tx, mailboxIdentityId, windowKey);
  const nextReset = new Date(
    Date.UTC(
      at.getUTCFullYear(),
      at.getUTCMonth(),
      at.getUTCDate() + 1,
      0,
      0,
      0,
      0,
    ),
  );
  await tx.clientMailboxIdentity.update({
    where: { id: mailboxIdentityId },
    data: { emailsSentToday: c, dailyWindowResetAt: nextReset },
  });
}

export async function markReservationConsumedForOutboundInTransaction(
  tx: Prisma.TransactionClient,
  outboundEmailId: string,
) {
  await tx.mailboxSendReservation.updateMany({
    where: { outboundEmailId, status: "RESERVED" },
    data: { status: "CONSUMED" },
  });
  const mb = await tx.outboundEmail.findUnique({
    where: { id: outboundEmailId },
    select: { mailboxIdentityId: true },
  });
  if (mb?.mailboxIdentityId) {
    await recomputeMailboxLedgerCounterInTransaction(
      tx,
      mb.mailboxIdentityId,
      new Date(),
    );
  }
}

export async function markReservationReleasedForOutboundInTransaction(
  tx: Prisma.TransactionClient,
  outboundEmailId: string,
) {
  const o = await tx.outboundEmail.findUnique({
    where: { id: outboundEmailId },
    select: { mailboxIdentityId: true },
  });
  await tx.mailboxSendReservation.updateMany({
    where: { outboundEmailId, status: "RESERVED" },
    data: { status: "RELEASED" },
  });
  if (o?.mailboxIdentityId) {
    await recomputeMailboxLedgerCounterInTransaction(
      tx,
      o.mailboxIdentityId,
      new Date(),
    );
  }
}

export async function markReservationReleasedForOutbound(
  outboundEmailId: string,
) {
  await prisma.$transaction(async (tx) => {
    await markReservationReleasedForOutboundInTransaction(tx, outboundEmailId);
  });
}

export async function markReservationConsumedForOutbound(outboundEmailId: string) {
  await prisma.$transaction(async (tx) => {
    await markReservationConsumedForOutboundInTransaction(tx, outboundEmailId);
  });
}
