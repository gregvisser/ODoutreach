/**
 * Share one mailbox's open slots across the sequences that still have work.
 *
 * Capacity is per mailbox. A sequence served by several mailboxes may use
 * each mailbox up to that mailbox's own remaining allowance in the same
 * launch. Sends booked on mailbox A are not an input to mailbox B, and this
 * function never adds another mailbox's spare onto the one it is scoring.
 *
 * Inside one mailbox, sequences with READY recipients split the open slots.
 * A sequence that is already ahead of one that is still waiting yields, so
 * launch order cannot starve the one that is behind. The result is never
 * larger than this mailbox's open slots, and it never raises a daily cap,
 * warm-up ramp, or pacing batch — callers pass the allowance those gates
 * already computed.
 */

export type MailboxSequenceContender = {
  sequenceId: string;
  /** Sends already booked today on THIS mailbox, before this launch. */
  sentToday: number;
};

export function fairShareSentKey(mailboxId: string, sequenceId: string): string {
  return `${mailboxId}|${sequenceId}`;
}

export function contendersForMailbox(input: {
  mailboxId: string;
  readySequenceIds: readonly string[];
  sentTodayByMailboxSequence: ReadonlyMap<string, number>;
}): MailboxSequenceContender[] {
  const seen = new Set<string>();
  const contenders: MailboxSequenceContender[] = [];
  for (const sequenceId of input.readySequenceIds) {
    if (!sequenceId || seen.has(sequenceId)) continue;
    seen.add(sequenceId);
    contenders.push({
      sequenceId,
      sentToday:
        input.sentTodayByMailboxSequence.get(
          fairShareSentKey(input.mailboxId, sequenceId),
        ) ?? 0,
    });
  }
  return contenders;
}

/**
 * How many of this mailbox's currently open slots this sequence may take.
 * `pacedRemaining` is that mailbox's own remainder. It is not a pool.
 */
export function fairSendsThisLaunch(input: {
  sequenceId: string;
  pacedRemaining: number;
  contenders: readonly MailboxSequenceContender[];
}): number {
  const open = Math.max(0, Math.floor(input.pacedRemaining));
  if (!Number.isFinite(open) || open <= 0) return 0;

  const others = input.contenders.filter(
    (contender) =>
      contender.sequenceId.length > 0 && contender.sequenceId !== input.sequenceId,
  );
  if (others.length === 0) return open;

  const mine = input.contenders.find(
    (contender) => contender.sequenceId === input.sequenceId,
  );
  const mySent = mine?.sentToday ?? 0;
  const leastOther = Math.min(...others.map((contender) => contender.sentToday));
  // Already ahead of a sequence that is still waiting. Leave the slots.
  if (mySent > leastOther) return 0;
  const peers = others.filter((contender) => contender.sentToday <= mySent).length;
  return Math.min(open, Math.ceil(open / (1 + peers)));
}
