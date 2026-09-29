/**
 * Stop one sequence from spending another mailbox's current batch.
 *
 * A Human launch sends only the paced slots that are open at that moment.
 * The pool picker used to walk every mailbox with remaining slots, highest
 * remaining first, so the first sequence launched in a window booked the
 * current batch on every mailbox — including mailboxes pinned to sequences
 * that had not launched yet. Those pinned sequences then saw zero remaining
 * and stayed held. The next morning the same launch order did it again.
 *
 * This never raises a cap. It only refuses a placement the pacing gate had
 * already allowed, so a later sequence on that mailbox can use the slot.
 */

export type MailboxShareOwner = {
  sequenceId: string;
  /** Sends already booked today on this mailbox, before this launch. */
  sentToday: number;
};

export function fairSendsThisLaunch(input: {
  sequenceId: string;
  mailboxId: string;
  preferredMailboxId: string | null;
  /** Slots still open on this mailbox at the start of this launch. */
  pacedRemaining: number;
  /** Other sequences that pin this mailbox and still have READY recipients. */
  owners: readonly MailboxShareOwner[];
  /**
   * Other sequences with no pinned mailbox that still have READY recipients.
   * They share unpinned mailboxes. They do not share a pinned mailbox.
   */
  autoPickPeers: number;
}): number {
  const open = Math.max(0, Math.floor(input.pacedRemaining));
  if (open <= 0) return 0;

  const others = input.owners.filter(
    (owner) => owner.sequenceId.length > 0 && owner.sequenceId !== input.sequenceId,
  );
  const iPin =
    input.preferredMailboxId !== null && input.preferredMailboxId === input.mailboxId;

  // A pinned mailbox belongs to the sequences that selected it.
  if (!iPin && others.length > 0) return 0;

  if (iPin && others.length > 0) {
    const mine = input.owners.find((owner) => owner.sequenceId === input.sequenceId);
    const mySent = mine?.sentToday ?? 0;
    const leastOther = Math.min(...others.map((owner) => owner.sentToday));
    // Already ahead of a sequence that is still waiting. Leave the rest.
    if (mySent > leastOther) return 0;
    const peers = others.filter((owner) => owner.sentToday <= mySent).length;
    return Math.ceil(open / (1 + peers));
  }

  const peers = Math.max(0, Math.floor(input.autoPickPeers));
  if (!iPin && peers > 0) return Math.ceil(open / (1 + peers));

  return open;
}
