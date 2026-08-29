/**
 * Which live mailboxes cannot send right now, and how many of the estate can.
 *
 * WHY THIS EXISTS
 * ---------------
 * The production probe (`scripts/ops-mailbox-credential-probe.ts`) has been able
 * to answer this since cycle 73. It runs on Mondays, prints the answer into a
 * GitHub Actions log, and exits 0 whether the news is good or catastrophic. On
 * 29 August 2026 that log said **27 of 55 live mailboxes can send**, with eight
 * stranded for up to 67 days — and nobody had read it, because reading it
 * requires opening a workflow run nobody has a reason to open.
 *
 * The daily digest is the one thing Greg actually reads. It already reports the
 * seven-day Google reconnect chore, so it looked as though mailbox health was
 * covered. It is not: `readGoogleReconnects` queries `provider: "GOOGLE"`, so
 * SIX of the eight stranded mailboxes — every Microsoft one, including
 * OpensDoors' own, off the air for 56 days — are invisible to it by
 * construction. The digest can say "Google logins: all in date, nothing to
 * reconnect" on a morning when a quarter of the estate cannot send.
 *
 * This roster closes that. It applies the SHIPPED rules from
 * `mailbox-connect-credential` rather than restating them, so the digest and the
 * probe cannot drift into disagreeing about which mailbox is off the air.
 *
 * Pure on purpose — the database read is the caller's job, so every rule below
 * is testable against fixtures and a fixed clock.
 */
import {
  isMailboxSendingCredentialLive,
  isStrandedByAbandonedConnect,
  type MailboxConnectCredentialRow,
  type MailboxConnectionStatusValue,
} from "./mailbox-connect-credential";

/** One mailbox row, as read from the database. */
export type StrandedMailboxRosterInput = {
  mailboxId: string;
  clientId: string;
  clientName: string;
  clientSlug: string;
  email: string;
  provider: string;
  connectionStatus: string;
  /** Whether a `MailboxIdentitySecret` row exists for this mailbox. */
  hasStoredCredential: boolean;
  isActive: boolean;
  workspaceRemovedAt: Date | null;
  isSendingEnabled: boolean;
  /**
   * The row's `updatedAt` — its last change of any kind.
   *
   * This is NOT definitionally "stranded since", and it is not called that. No
   * column records when a mailbox entered PENDING_CONNECTION: `oauthStateExpiresAt`
   * was added too recently to be set on the rows that matter. But nothing writes
   * to a mailbox holding no credential — it cannot sync and it cannot send — so
   * in practice the last change IS the abandoned Connect. Checked rather than
   * assumed: two probes twelve hours apart (runs 33210823162 and 33244256265)
   * showed all eight ages either static or advanced by exactly the elapsed day,
   * so these timestamps are not being churned by anything else.
   */
  pendingSince: Date | null;
  /** Survives an abandoned Connect, so it is the evidence this mailbox once worked. */
  lastSyncAt: Date | null;
};

export type StrandedMailboxRosterEntry = StrandedMailboxRosterInput & {
  /** Addresses are masked: this output is pasted into logs and cycle notes. */
  maskedEmail: string;
  /** Whether the row changed inside the digest window — see `isNewlyStranded`. */
  isNew: boolean;
  /** The sentence shown in the alert. */
  label: string;
};

export type StrandedMailboxClientGroup = {
  clientId: string;
  clientName: string;
  clientSlug: string;
  entries: StrandedMailboxRosterEntry[];
};

export type StrandedMailboxRoster = {
  /** The stranded mailboxes, most recently stranded first. */
  entries: StrandedMailboxRosterEntry[];
  /** The same, grouped by client, because a client is who gets telephoned. */
  strandedByClient: StrandedMailboxClientGroup[];
  strandedCount: number;
  /** Of those, the ones that appeared inside the digest window. */
  newlyStrandedCount: number;
  /** Live means active and on a workspace that has not been removed. */
  liveCount: number;
  /** The headline the probe reports: how many of the live can actually send. */
  sendableCount: number;
};

/**
 * The digest covers the last 24 hours, so "new" means the same thing here that
 * it means everywhere else in the alert.
 */
const NEW_WINDOW_MS = 24 * 60 * 60 * 1000;

function maskAddress(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
}

function ageInDays(from: Date | null, now: Date): string {
  if (!from) return "age unknown";
  const days = Math.floor((now.getTime() - from.getTime()) / 86_400_000);
  if (days < 1) return "today";
  return days === 1 ? "1 day" : `${days} days`;
}

/**
 * An unknown date is treated as long-standing, NEVER as new.
 *
 * Guessing new would put a subject line in front of Greg saying a mailbox went
 * off the air last night when nothing is known to have changed — and a subject
 * that cries wolf is the failure this whole digest is built to avoid.
 */
function isNewlyStranded(pendingSince: Date | null, now: Date): boolean {
  if (!pendingSince) return false;
  return now.getTime() - pendingSince.getTime() < NEW_WINDOW_MS;
}

function describe(row: StrandedMailboxRosterInput, now: Date): string {
  const age = ageInDays(row.pendingSince, now);
  // `lastSyncAt` survives an abandoned Connect, so it separates a mailbox that
  // was genuinely working from one that was never connected at all. They need
  // different conversations with the client, so they must not read the same.
  return row.lastSyncAt !== null
    ? `${age} — was working, last inbox sync ${ageInDays(row.lastSyncAt, now)} ago`
    : `${age} — never connected, no inbox sync on record`;
}

/** The subset of fields the shipped credential rules read. */
function credentialRow(row: StrandedMailboxRosterInput): MailboxConnectCredentialRow {
  return {
    connectionStatus: row.connectionStatus as MailboxConnectionStatusValue,
    hasStoredCredential: row.hasStoredCredential,
    isActive: row.isActive,
    workspaceRemovedAt: row.workspaceRemovedAt,
  };
}

export function buildStrandedMailboxRoster(
  rows: StrandedMailboxRosterInput[],
  now: Date,
): StrandedMailboxRoster {
  // A removed or inactive mailbox is not expected to send, so it is not an
  // outage — the same exclusion the shipped rules already apply.
  const live = rows.filter(
    (row) => row.isActive && row.workspaceRemovedAt === null,
  );

  const entries: StrandedMailboxRosterEntry[] = live
    .filter((row) => isStrandedByAbandonedConnect(credentialRow(row)))
    .map((row) => ({
      ...row,
      maskedEmail: maskAddress(row.email),
      isNew: isNewlyStranded(row.pendingSince, now),
      label: describe(row, now),
    }));

  entries.sort((a, b) => {
    // Most recent first: a fresh strand is the one still worth chasing, because
    // somebody was at that screen. A row with no date sorts last rather than
    // claiming to be the oldest.
    const at = a.pendingSince?.getTime() ?? Number.NEGATIVE_INFINITY;
    const bt = b.pendingSince?.getTime() ?? Number.NEGATIVE_INFINITY;
    if (at !== bt) return bt - at;
    // Stable, human order for ties so the list does not reshuffle between days.
    const byClient = a.clientName.localeCompare(b.clientName);
    if (byClient !== 0) return byClient;
    return a.email.localeCompare(b.email);
  });

  const groups = new Map<string, StrandedMailboxClientGroup>();
  for (const entry of entries) {
    const existing = groups.get(entry.clientId);
    if (existing) {
      existing.entries.push(entry);
      continue;
    }
    groups.set(entry.clientId, {
      clientId: entry.clientId,
      clientName: entry.clientName,
      clientSlug: entry.clientSlug,
      entries: [entry],
    });
  }

  return {
    entries,
    // Insertion order, which is `entries` order, which is most-recent-first.
    strandedByClient: [...groups.values()],
    strandedCount: entries.length,
    newlyStrandedCount: entries.filter((entry) => entry.isNew).length,
    liveCount: live.length,
    sendableCount: live.filter((row) => isMailboxSendingCredentialLive(credentialRow(row)))
      .length,
  };
}
