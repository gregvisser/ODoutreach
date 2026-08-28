/**
 * The seven-day Google reconnect clock, and the only place its arithmetic lives.
 *
 * ## Why this clock exists at all
 *
 * The Google OAuth app is deliberately UNPUBLISHED — the owner's decision of
 * 28 August 2026, recorded in `GOOGLE-7-DAY-MANUAL-POLICY.md`, and not to be
 * re-argued here. While an app is in Testing, Google expires every test user's
 * REFRESH token seven days after consent. So each connected Google mailbox stops
 * being able to send on a rolling weekly clock, and somebody has to press
 * Reconnect. Microsoft mailboxes are unaffected: this is a Google-only clock,
 * and nothing in this module may change what a Microsoft row shows.
 *
 * ## Why it is a countdown and not a live check
 *
 * There is no API that reports "this refresh token dies on Friday". The only
 * honest signal available is arithmetic over `connectedAt`, which the Google
 * callback writes at consent. That makes the whole thing a pure function of a
 * stored date and a clock — which is exactly why it is testable, and why it is
 * here rather than inline in a component.
 *
 * ## The failure this closes
 *
 * Before this, the way OpensDoors learned a mailbox had expired was that
 * outreach stopped. A failure that reports nothing is this repository's worst
 * recorded habit, and a weekly MANUAL reconnect policy with no reminder is a
 * task that gets missed. The countdown is the reminder; it is not a substitute
 * for the policy, and the policy is not a substitute for it.
 *
 * Note on scope: a day-6 nudge string already existed inline in the mailbox
 * panel. It gave one day of notice, had no deadline date, no overdue state, and
 * no test. This replaces it rather than sitting beside it, so there is one
 * number and one place to change it.
 */

/** Google's Testing-mode refresh-token lifetime: seven days from consent. */
export const GOOGLE_REFRESH_TOKEN_TTL_MS = 7 * 86_400_000;

/**
 * When the alarm sounds: two days remaining, i.e. from DAY FIVE after consent.
 *
 * Stated as days REMAINING rather than days elapsed because that is what the
 * operator reads and what the alert filters on, and the two framings are easy
 * to confuse. Five days elapsed of a seven-day life leaves two.
 *
 * Two rather than five because the digest that carries this alert sends EVERY
 * day. At five days' notice each mailbox would be named in five consecutive
 * emails a week, every week, for ever — an alert nobody reads is the same as no
 * alert. Two gives three mornings of warning (2 left, 1 left, under a day) plus
 * every morning it stays overdue.
 */
export const GOOGLE_RECONNECT_WARN_WHEN_DAYS_REMAINING_AT_MOST = 2;

/**
 * `ok` — in date, nothing to do.
 * `due` — inside the warning window; reconnect this week.
 * `overdue` — the token is gone; this mailbox is not sending.
 * `unknown` — connected, but no consent date to count from (see below).
 */
export type GoogleReconnectStatus = "ok" | "due" | "overdue" | "unknown";

export type GoogleReconnectCountdown = {
  status: GoogleReconnectStatus;
  /** The instant the refresh token dies. Null only when `status` is `unknown`. */
  deadline: Date | null;
  /**
   * Whole days left, ROUNDED DOWN, and negative once overdue. Null when
   * `status` is `unknown`. Rounding down is deliberate: with 5.9 days left,
   * "5 days" is a promise that can be kept and "6 days" is not.
   */
  daysRemaining: number | null;
  /** True for anything an operator must act on — `due`, `overdue` or `unknown`. */
  needsAttention: boolean;
  /** The sentence shown on the mailbox row and in the alert. */
  label: string;
};

/** The row fields this needs. Deliberately structural, so both Prisma rows and
 *  the panel's serialised props satisfy it without a conversion layer. */
export type GoogleReconnectSubject = {
  provider: string;
  connectionStatus: string;
  connectedAt: Date | null;
};

/** When a token consented to at `connectedAt` stops working. */
export function googleRefreshTokenDeadline(connectedAt: Date): Date {
  return new Date(connectedAt.getTime() + GOOGLE_REFRESH_TOKEN_TTL_MS);
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Format in UTC, always.
 *
 * This label is rendered both in a browser and in a Node alert script, and a
 * consent late in the evening puts the deadline instant either side of midnight
 * depending on the reader's timezone. Formatting from local parts would print
 * two different deadlines for the same mailbox, and would also produce a
 * server/client hydration mismatch. UTC is the one answer everybody shares.
 */
export function formatGoogleReconnectDate(date: Date): string {
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/**
 * The countdown for one mailbox row, or `null` if this row has no Google clock.
 *
 * `null` means "say nothing here" — a Microsoft mailbox, or a Google mailbox
 * that is not currently connected (a DRAFT or DISCONNECTED row already tells the
 * operator to press Connect; a countdown to an expiry that has no token behind
 * it would only add noise).
 */
export function resolveGoogleReconnectCountdown(
  row: GoogleReconnectSubject,
  now: Date,
): GoogleReconnectCountdown | null {
  if (row.provider !== "GOOGLE") return null;
  if (row.connectionStatus !== "CONNECTED") return null;

  if (!row.connectedAt) {
    // Fails toward attention. Both callbacks write `connectedAt` in the same
    // update that sets CONNECTED, so a connected row without one is a row this
    // codebase cannot currently produce — and an unexplained row is worth a look
    // rather than a silent assumption that it is fresh.
    return {
      status: "unknown",
      deadline: null,
      daysRemaining: null,
      needsAttention: true,
      label:
        "Google — reconnect date unknown. Press Reconnect to start the seven-day clock.",
    };
  }

  const deadline = googleRefreshTokenDeadline(row.connectedAt);
  const msRemaining = deadline.getTime() - now.getTime();
  const daysRemaining = Math.floor(msRemaining / 86_400_000);
  const deadlineLabel = formatGoogleReconnectDate(deadline);

  // Inclusive of the deadline instant itself: the token is gone AT the deadline,
  // not one millisecond after it. Fail toward "reconnect" over "probably fine".
  if (msRemaining <= 0) {
    return {
      status: "overdue",
      deadline,
      daysRemaining,
      needsAttention: true,
      label: `Reconnect needed — this Google login expired on ${deadlineLabel}`,
    };
  }

  const remainingLabel =
    daysRemaining === 0
      ? "less than a day left"
      : `${daysRemaining} ${daysRemaining === 1 ? "day" : "days"} left`;

  return {
    status:
      daysRemaining <= GOOGLE_RECONNECT_WARN_WHEN_DAYS_REMAINING_AT_MOST ? "due" : "ok",
    deadline,
    daysRemaining,
    needsAttention: daysRemaining <= GOOGLE_RECONNECT_WARN_WHEN_DAYS_REMAINING_AT_MOST,
    label: `Google — reconnect by ${deadlineLabel}, ${remainingLabel}`,
  };
}
