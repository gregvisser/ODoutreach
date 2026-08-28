/**
 * E-06 — the pure half: who owns a mailbox address held by two workspaces.
 *
 * Deliberately NOT behind `server-only`. The database-backed gates live in
 * `@/server/mailbox/mailbox-address-exclusivity`, but the grouping and the
 * ownership rule are pure, and the ops probe has to run them outside Next —
 * where a `server-only` import fails to resolve. Splitting them also means the
 * probe imports the SHIPPED rule rather than a second copy of it, which is the
 * only thing that makes the probe evidence about production.
 *
 * The rule itself: when one address is attached to more than one workspace,
 * only the workspace that had it FIRST keeps a verbatim copy of that inbox.
 */

/** The subset of a mailbox row this rule reasons about. */
export type LiveMailboxRow = {
  id: string;
  clientId: string;
  emailNormalized: string;
  /**
   * `connectedAt ?? createdAt`. Used only as the ownership tie-break below —
   * the workspace that had the address FIRST keeps it.
   */
  since: Date;
};

export type SharedMailboxAddress = {
  emailNormalized: string;
  /** The mailbox row whose workspace may persist raw inbound mail. */
  ownerMailboxId: string;
  ownerClientId: string;
  /** Every live row for this address, oldest first. */
  rows: LiveMailboxRow[];
};

/**
 * Deterministic ownership: oldest `since` wins, and where two rows share a
 * timestamp the lower id wins so the answer never depends on row order.
 *
 * Determinism is the point. If this flipped between syncs, both workspaces
 * would take turns writing the raw store and the leak would continue at half
 * the rate while every individual sync looked correct.
 */
export function resolveRawStoreOwner(rows: readonly LiveMailboxRow[]): LiveMailboxRow | null {
  let owner: LiveMailboxRow | null = null;
  for (const row of rows) {
    if (!owner) {
      owner = row;
      continue;
    }
    const older = row.since.getTime() - owner.since.getTime();
    if (older < 0 || (older === 0 && row.id < owner.id)) {
      owner = row;
    }
  }
  return owner;
}

/**
 * Groups live mailbox rows by address and returns only those addresses that
 * are attached to more than one workspace.
 */
export function findSharedMailboxAddresses(
  rows: readonly LiveMailboxRow[],
): SharedMailboxAddress[] {
  const byAddress = new Map<string, LiveMailboxRow[]>();
  for (const row of rows) {
    const existing = byAddress.get(row.emailNormalized);
    if (existing) existing.push(row);
    else byAddress.set(row.emailNormalized, [row]);
  }

  const shared: SharedMailboxAddress[] = [];
  for (const [emailNormalized, addressRows] of byAddress) {
    const clientIds = new Set(addressRows.map((r) => r.clientId));
    if (clientIds.size < 2) continue;
    const owner = resolveRawStoreOwner(addressRows);
    if (!owner) continue;
    shared.push({
      emailNormalized,
      ownerMailboxId: owner.id,
      ownerClientId: owner.clientId,
      rows: [...addressRows].sort(
        (a, b) => a.since.getTime() - b.since.getTime() || (a.id < b.id ? -1 : 1),
      ),
    });
  }
  return shared.sort((a, b) => (a.emailNormalized < b.emailNormalized ? -1 : 1));
}

/** A live mailbox row for this address on a DIFFERENT, live workspace. */
export type MailboxAddressConflict = {
  mailboxId: string;
  clientId: string;
  clientName: string;
};

/**
 * The refusal a staff member reads. It names the other workspace, because
 * "already in use" with no name sends someone hunting through seventeen of
 * them, and it says what to do instead rather than only what was blocked.
 */
export function mailboxAddressConflictMessage(
  emailNormalized: string,
  conflicts: readonly MailboxAddressConflict[],
): string {
  const names = conflicts.map((c) => c.clientName).join(", ");
  return (
    `${emailNormalized} is already connected to ${names}. ` +
    "One mailbox can only belong to one workspace — connecting it to a second " +
    "would copy every message in that inbox, replies included, into both. " +
    "Remove it from the other workspace first, or use a different address."
  );
}
