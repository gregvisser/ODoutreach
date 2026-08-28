/**
 * The four-at-a-time release gate for the SEND SCREEN.
 *
 * ## What the client actually asked for
 *
 * Relayed from the owner: "the system only displays 4 at a time to stop them
 * from sending loads manually. They can only see the next 4 once they have
 * manually sent the first 4 and so on. This is just for corporate clients."
 *
 * So: staff pull a list of 30, and the screen shows 4. The next 4 appear only
 * once all 4 have been sent AND 45 minutes have passed. The clock is PER
 * MAILBOX, PER ACCOUNT — two mailboxes on the same client never share a wait.
 *
 * ## THIS IS NOT `send-pacing.ts`, and the difference matters
 *
 * `@/lib/mailboxes/send-pacing` paces what the MACHINE dispatches out of the
 * outbound queue: it decides what time of day a queued email leaves. This
 * module gates what a HUMAN can SEE on a screen before they have chosen to send
 * anything at all. Different layer, different actor, different purpose. They
 * are deliberately not aware of each other, and neither one is a substitute for
 * the other. Changing one to satisfy the other is the mistake this comment
 * exists to prevent.
 *
 * ## It can only ever slow sending down
 *
 * There is no input to this module that causes MORE email to be exposed than
 * the caller already had. It slices; it never adds. That is why it was safe to
 * build first, ahead of everything else in phase 2.
 *
 * Pure — no Prisma, no environment, no clock. `now` and the send history are
 * passed in, so the screen, the server and the tests all reach the same answer.
 */

import { isCorporateGrade, type ClientAccountGrade } from "@/lib/clients/client-account-grade";

/**
 * Four. The number the owner asked for by name. It is a COMMERCIAL choice about
 * how staff work, not a deliverability standard — no provider publishes a batch
 * size, and anyone quoting 4 as a safe number is repeating folklore. Recorded
 * as judgement so a later cycle does not cite it as sourced.
 */
export const MANUAL_SEND_GROUP_SIZE = 4;

/**
 * Forty-five minutes between groups. Also the owner's number and also
 * judgement. The intent is that a person clears a handful of emails and then
 * does something else — not that 45 minutes is a threshold any mailbox provider
 * recognises.
 */
export const MANUAL_SEND_COOLDOWN_MINUTES = 45;

const MINUTE_MS = 60 * 1000;

/**
 * One manual send already made from this mailbox for this client. Only the
 * moment matters — who it went to is the caller's business.
 */
export type ManualSendRecord = {
  sentAt: Date;
};

export type ManualSendWindowState =
  /** Not a corporate account — the gate does not apply and never has. */
  | "UNGATED"
  /** Nothing left to send. */
  | "EMPTY"
  /** Rows are exposed and staff may send them now. */
  | "OPEN"
  /** The current group of four is not finished — the rest are still exposed. */
  | "WAITING_ON_SENDS"
  /** All four were sent; the 45 minutes have not elapsed. Nothing is exposed. */
  | "WAITING_ON_CLOCK";

export type ManualSendWindowDecision<T> = {
  state: ManualSendWindowState;
  /** True when the four-at-a-time rule is in force for this client. */
  gated: boolean;
  /** The rows the screen may render. Never longer than the queue it was given. */
  exposed: readonly T[];
  /** How many the gate is holding back right now. */
  withheldCount: number;
  /**
   * When the next group becomes available, if the gate is waiting on the clock.
   * Null in every other state — including OPEN, where the answer is "now".
   */
  nextGroupAvailableAt: Date | null;
  /** Plain English for the screen. Says what is happening and what unblocks it. */
  reason: string;
};

export type ManualSendWindowInput<T> = {
  grade: ClientAccountGrade | null | undefined;
  /**
   * The recipients still waiting to be sent, in the order staff would work
   * them. Already-sent rows must NOT appear here.
   */
  queue: readonly T[];
  /**
   * Every manual send already made FROM THIS MAILBOX for THIS CLIENT. Order is
   * irrelevant; this module finds the latest itself. Scoping this list to one
   * mailbox is what makes the clock per-mailbox, and it is the caller's job.
   */
  mailboxSendHistory: readonly ManualSendRecord[];
  now: Date;
};

function latestSentAt(history: readonly ManualSendRecord[]): Date | null {
  let latest: Date | null = null;
  for (const record of history) {
    if (latest === null || record.sentAt.getTime() > latest.getTime()) {
      latest = record.sentAt;
    }
  }
  return latest;
}

function formatMinutes(totalMinutes: number): string {
  const minutes = Math.max(1, Math.ceil(totalMinutes));
  if (minutes === 1) return "1 minute";
  return `${String(minutes)} minutes`;
}

/**
 * Decide how many of the queue the screen may show.
 *
 * The model is deliberately simple: count how many manual sends this mailbox
 * has already made, and read off where that lands inside a group of four.
 *
 *   • a whole number of groups done (including none at all) → the clock decides
 *   • part-way through a group                             → show the remainder
 *
 * Counting total sends rather than tracking an explicit "current group" record
 * means there is no group state to get out of step with reality, and no
 * migration needed if the group size ever changes.
 */
export function decideManualSendWindow<T>(
  input: ManualSendWindowInput<T>,
): ManualSendWindowDecision<T> {
  const { grade, queue, mailboxSendHistory, now } = input;

  // Not corporate: hand back exactly what came in. This branch must stay first
  // and must stay total — the gate is opt-in by grade, and an ungraded client
  // behaves today exactly as it did yesterday.
  if (!isCorporateGrade(grade)) {
    return {
      state: "UNGATED",
      gated: false,
      exposed: queue,
      withheldCount: 0,
      nextGroupAvailableAt: null,
      reason: "This account is not graded Corporate, so recipients are not released in groups.",
    };
  }

  if (queue.length === 0) {
    return {
      state: "EMPTY",
      gated: true,
      exposed: [],
      withheldCount: 0,
      nextGroupAvailableAt: null,
      reason: "There is nobody left to send to on this list.",
    };
  }

  const sentCount = mailboxSendHistory.length;
  const positionInGroup = sentCount % MANUAL_SEND_GROUP_SIZE;

  // Part-way through a group. The remainder of the four stays visible: the rule
  // is "you may not see the NEXT four", not "you may not finish this four".
  if (positionInGroup !== 0) {
    const remaining = MANUAL_SEND_GROUP_SIZE - positionInGroup;
    const exposed = queue.slice(0, remaining);
    return {
      state: "WAITING_ON_SENDS",
      gated: true,
      exposed,
      withheldCount: queue.length - exposed.length,
      nextGroupAvailableAt: null,
      reason:
        `${String(remaining)} of this group of ${String(MANUAL_SEND_GROUP_SIZE)} still to send. ` +
        `The next ${String(MANUAL_SEND_GROUP_SIZE)} appear once all ${String(MANUAL_SEND_GROUP_SIZE)} ` +
        `have been sent and ${String(MANUAL_SEND_COOLDOWN_MINUTES)} minutes have passed.`,
    };
  }

  const lastSend = latestSentAt(mailboxSendHistory);

  // A clean group boundary. Either nothing has ever been sent from this mailbox
  // (open immediately) or a group just completed (the clock is running).
  if (lastSend !== null) {
    const elapsedMs = now.getTime() - lastSend.getTime();
    const cooldownMs = MANUAL_SEND_COOLDOWN_MINUTES * MINUTE_MS;
    if (elapsedMs < cooldownMs) {
      const availableAt = new Date(lastSend.getTime() + cooldownMs);
      return {
        state: "WAITING_ON_CLOCK",
        gated: true,
        exposed: [],
        withheldCount: queue.length,
        nextGroupAvailableAt: availableAt,
        reason:
          `That group of ${String(MANUAL_SEND_GROUP_SIZE)} is sent. The next ` +
          `${String(MANUAL_SEND_GROUP_SIZE)} appear in ` +
          `${formatMinutes((cooldownMs - elapsedMs) / MINUTE_MS)}.`,
      };
    }
  }

  const exposed = queue.slice(0, MANUAL_SEND_GROUP_SIZE);
  return {
    state: "OPEN",
    gated: true,
    exposed,
    withheldCount: queue.length - exposed.length,
    nextGroupAvailableAt: null,
    reason:
      `Showing ${String(exposed.length)} of ${String(queue.length)}. ` +
      `The next group appears once these have been sent and ` +
      `${String(MANUAL_SEND_COOLDOWN_MINUTES)} minutes have passed.`,
  };
}
