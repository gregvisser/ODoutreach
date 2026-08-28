/**
 * Every Google mailbox in the estate, in the order the weekly chore should be
 * worked, with the counts the alert needs.
 *
 * ONE roster, read by three surfaces: the all-clients reconnect screen, the
 * day-five alert email, and (via `resolveGoogleReconnectCountdown`) the per-row
 * label in the client mailbox panel. They must never be able to disagree about
 * which mailbox is due, which is why the sort and the filter live here rather
 * than in a page component and again in a script.
 *
 * Pure on purpose — the database read is the caller's job, so every rule below
 * is testable against fixtures and a fixed clock.
 */
import {
  resolveGoogleReconnectCountdown,
  type GoogleReconnectCountdown,
} from "./google-refresh-token-expiry";

/** One mailbox row, as read from the database. */
export type GoogleReconnectRosterInput = {
  mailboxId: string;
  clientId: string;
  clientName: string;
  clientSlug: string;
  provider: string;
  connectionStatus: string;
  connectedAt: Date | null;
  email: string;
};

export type GoogleReconnectRosterEntry = GoogleReconnectRosterInput & {
  /** Null when the row is not CONNECTED — there is no live token to count down. */
  countdown: GoogleReconnectCountdown | null;
  needsAttention: boolean;
  /** The sentence shown on screen and in the alert. */
  label: string;
};

export type GoogleReconnectClientGroup = {
  clientId: string;
  clientName: string;
  clientSlug: string;
  entries: GoogleReconnectRosterEntry[];
};

export type GoogleReconnectRoster = {
  /** Every Google mailbox, most urgent first. */
  entries: GoogleReconnectRosterEntry[];
  /** Only those needing action — what the alert names. */
  dueSoon: GoogleReconnectRosterEntry[];
  /** The same, grouped by client, because a client is who gets telephoned. */
  dueSoonByClient: GoogleReconnectClientGroup[];
  totalGoogleMailboxes: number;
  overdueCount: number;
  dueSoonCount: number;
};

/**
 * Sort weight. Lower is more urgent.
 *
 * A Google row that is CONNECTED but has no countdown cannot happen (the
 * countdown only returns null for non-connected rows), so the buckets are:
 * overdue/unknown, then due/ok by days remaining, then rows with no token at
 * all. Not-connected rows go LAST despite needing attention: they are already
 * dead rather than about to die, so they do not push a mailbox that is still
 * sending today off the top of the list.
 */
function urgency(entry: GoogleReconnectRosterEntry): number {
  const countdown = entry.countdown;
  if (!countdown) return Number.MAX_SAFE_INTEGER;
  if (countdown.status === "unknown") return -Number.MAX_SAFE_INTEGER;
  return countdown.daysRemaining ?? 0;
}

/**
 * Rows that are Google but not connected. They are still the same weekly chore
 * — an abandoned Connect leaves exactly this shape — so the screen shows them,
 * but with the status rather than a countdown to an expiry that already
 * happened.
 */
function notConnectedLabel(connectionStatus: string): string {
  switch (connectionStatus) {
    case "PENDING_CONNECTION":
      return "Not connected — a sign-in was started and never finished. Press Connect.";
    case "CONNECTION_ERROR":
      return "Not connected — the last sign-in failed. Press Connect.";
    case "DISCONNECTED":
      return "Not connected — this mailbox was disconnected. Press Connect.";
    default:
      return "Not connected — press Connect and sign in as this mailbox.";
  }
}

export function buildGoogleReconnectRoster(
  rows: GoogleReconnectRosterInput[],
  now: Date,
): GoogleReconnectRoster {
  const entries: GoogleReconnectRosterEntry[] = rows
    .filter((row) => row.provider === "GOOGLE")
    .map((row) => {
      const countdown = resolveGoogleReconnectCountdown(row, now);
      return {
        ...row,
        countdown,
        needsAttention: countdown ? countdown.needsAttention : true,
        label: countdown ? countdown.label : notConnectedLabel(row.connectionStatus),
      };
    });

  entries.sort((a, b) => {
    const byUrgency = urgency(a) - urgency(b);
    if (byUrgency !== 0) return byUrgency;
    // Stable, human order for ties so the list does not reshuffle between loads
    // while somebody is working down it with a browser tab open.
    const byClient = a.clientName.localeCompare(b.clientName);
    if (byClient !== 0) return byClient;
    return a.email.localeCompare(b.email);
  });

  const dueSoon = entries.filter((entry) => entry.needsAttention);

  const groups = new Map<string, GoogleReconnectClientGroup>();
  for (const entry of dueSoon) {
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
    dueSoon,
    // Insertion order, which is `dueSoon` order, which is most-urgent-first.
    dueSoonByClient: [...groups.values()],
    totalGoogleMailboxes: entries.length,
    overdueCount: entries.filter((e) => e.countdown?.status === "overdue").length,
    dueSoonCount: dueSoon.length,
  };
}
