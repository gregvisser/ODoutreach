/**
 * H2 (production hardening) — Non-Delivery Report (NDR / DSN) bounce detection.
 *
 * The live Gmail/Graph send path has no ESP webhook, so hard bounces are never
 * captured and dead addresses get re-emailed. This pure classifier inspects a
 * synced inbox message and decides whether it is a permanent (hard) bounce and,
 * if so, which recipient address failed — so the caller can suppress it via the
 * existing `suppressRecipientForHardBounce`.
 *
 * Pure (no I/O) and conservative by design: it only reports `isHardBounce` on a
 * CLEAR permanent signal. Soft/transient bounces (4.x.x, "mailbox full",
 * greylisting) are deliberately NOT hard — we never want to suppress an address
 * that might still be deliverable. The caller adds a second safety gate (only
 * suppress an address we actually sent to), so an imperfect recipient
 * extraction cannot suppress an unrelated address.
 */

const DAEMON_LOCALPARTS = [
  "mailer-daemon",
  "postmaster",
  "mail-daemon",
  "mdaemon",
];

const SUBJECT_BOUNCE_PATTERNS: RegExp[] = [
  /undeliverable/i,
  /delivery\s+(status\s+notification|has\s+failed|failure|incomplete)/i,
  /mail\s+delivery\s+(failed|subsystem)/i,
  /returning\s+message\s+to\s+sender/i,
  /failure\s+notice/i,
  /message\s+(could\s+not\s+be\s+delivered|not\s+delivered)/i,
  /delivery\s+(report|failure)/i,
];

const BODY_DSN_MARKERS: RegExp[] = [
  /message\/delivery-status/i,
  /final-recipient:/i,
  /original-recipient:/i,
  /diagnostic-code:/i,
  /action:\s*failed/i,
  /report-type=delivery-status/i,
];

/** Clear permanent-failure signals. */
const HARD_PHRASES: RegExp[] = [
  /\buser\s+unknown\b/i,
  /\bno\s+such\s+user\b/i,
  /\bno\s+such\s+recipient\b/i,
  /\brecipient\s+(address\s+)?rejected\b/i,
  /\baddress\s+(not\s+found|rejected)\b/i,
  /\b(recipient|user|mailbox|account)\s+(not\s+found|does\s+not\s+exist|doesn['’]?t\s+exist|unavailable|disabled|deactivated)\b/i,
  /\bdoes\s+not\s+exist\b/i,
  /\bmailbox\s+unavailable\b/i,
  /\bunknown\s+recipient\b/i,
];

/** Transient signals that must NOT be treated as a hard bounce. */
const SOFT_PHRASES: RegExp[] = [
  /\btemporar/i,
  /\bdeferred\b/i,
  /\btry\s+again\b/i,
  /\bgreylist/i,
  /\brate\s*limit/i,
  /\b(over\s*quota|quota\s+exceeded|mailbox\s+full|account\s+is\s+full)\b/i,
  /\binsufficient\s+system\s+storage\b/i,
];

export type BounceClassification = {
  /** The message looks like a delivery-status / NDR bounce-back at all. */
  isBounce: boolean;
  /** A CLEAR permanent failure — safe(ish) to suppress (caller re-gates). */
  isHardBounce: boolean;
  /** The recipient address that failed, normalized lowercase, or null. */
  failedRecipient: string | null;
  /** Short human note on why it classified this way (for logs/audit). */
  evidence: string;
};

function lc(value: string | null | undefined): string {
  return typeof value === "string" ? value : "";
}

function senderIsDaemon(fromEmail: string): boolean {
  const f = fromEmail.trim().toLowerCase();
  if (!f) return false;
  const local = f.split("@")[0] ?? "";
  return DAEMON_LOCALPARTS.some((d) => local === d || local.includes(d));
}

/** Extract the first email that isn't the daemon/sender, preferring DSN fields. */
function extractFailedRecipient(
  body: string,
  fromEmail: string,
): string | null {
  // 1. Authoritative DSN fields.
  const fieldRe =
    /(?:final-recipient|original-recipient)\s*:\s*(?:rfc822\s*;)?\s*<?([^\s<>;]+@[^\s<>;]+?)>?\s*$/im;
  const field = body.match(fieldRe);
  if (field?.[1]) return field[1].trim().toLowerCase();

  // 2. Fuzzy: an address sitting next to a permanent-failure signal. The
  //    caller's "did we send to it?" gate makes a wrong guess harmless.
  const fuzzyRe =
    /<?([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})>?[\s:>]{0,4}.{0,60}?(?:55\d|5\.\d\.\d|user\s+unknown|not\s+found|does\s+not\s+exist|rejected)/i;
  const fuzzy = body.match(fuzzyRe);
  const daemon = fromEmail.trim().toLowerCase();
  if (fuzzy?.[1]) {
    const candidate = fuzzy[1].trim().toLowerCase();
    if (candidate !== daemon) return candidate;
  }
  return null;
}

export function classifyInboundBounce(input: {
  fromEmail: string | null | undefined;
  subject: string | null | undefined;
  bodyText: string | null | undefined;
}): BounceClassification {
  const fromEmail = lc(input.fromEmail).trim();
  const subject = lc(input.subject);
  const body = lc(input.bodyText);
  const haystack = `${subject}\n${body}`;

  const daemon = senderIsDaemon(fromEmail);
  const subjectHit = SUBJECT_BOUNCE_PATTERNS.some((re) => re.test(subject));
  const bodyHit = BODY_DSN_MARKERS.some((re) => re.test(body));
  const isBounce = daemon || subjectHit || bodyHit;

  if (!isBounce) {
    return {
      isBounce: false,
      isHardBounce: false,
      failedRecipient: null,
      evidence: "not a bounce",
    };
  }

  const has5xx = /\b5\.\d{1,3}\.\d{1,3}\b/.test(haystack) || /\b550\b/.test(haystack);
  const has4xx = /\b4\.\d{1,3}\.\d{1,3}\b/.test(haystack);
  const hardPhrase = HARD_PHRASES.some((re) => re.test(haystack));
  const softPhrase = SOFT_PHRASES.some((re) => re.test(haystack));

  // Hard only on a clear permanent signal AND no transient signal overriding it.
  const isHardBounce = (has5xx || hardPhrase) && !(has4xx && !has5xx) && !softPhrase;

  const failedRecipient = isHardBounce
    ? extractFailedRecipient(body, fromEmail)
    : null;

  const evidence = [
    daemon ? "daemon-sender" : null,
    subjectHit ? "subject" : null,
    bodyHit ? "dsn-markers" : null,
    has5xx ? "5xx" : null,
    has4xx ? "4xx" : null,
    hardPhrase ? "hard-phrase" : null,
    softPhrase ? "soft-phrase" : null,
  ]
    .filter(Boolean)
    .join(",");

  return { isBounce, isHardBounce, failedRecipient, evidence };
}
