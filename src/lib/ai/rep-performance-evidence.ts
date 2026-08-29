/**
 * Comparing senders — the arithmetic, computed WITHOUT a model.
 *
 * The queue asks for a "rep performance dashboard with AI explaining the
 * differences". Two things about THIS application had to be checked before that
 * could be built honestly, and both change what the screen is allowed to claim.
 *
 * FIRST: A SENDER IS A MAILBOX, NOT A SALESPERSON.
 * The only per-person dimension on a send is `OutboundEmail.mailboxIdentityId`
 * — which mailbox it left from. There is no rep, no owner, no territory and no
 * assignment of prospects to people anywhere in the schema.
 *
 * SECOND, AND IT IS THE ONE THAT MATTERS: NOBODY HERE IS WRITING THEIR OWN COPY.
 * Sequences and templates are scoped to the CLIENT, never to a mailbox —
 * verified against the schema, where `mailboxIdentityId` appears on outbound
 * mail, a sync cursor and a send-quota ledger, and on nothing that holds copy.
 * Every sender in a client sends the same words. And the mailbox is not even
 * chosen per prospect: `resolveGovernedSendingMailboxFromRows` takes the primary
 * connected mailbox, or the first connected one that can send — so volume
 * differences between senders are an artefact of which mailbox is flagged
 * primary and which were connected that week, and each sender's audience is
 * whatever happened to be queued while their mailbox was the available one.
 *
 * So a difference between senders in this product CANNOT mean "this person
 * writes better email" — the words are identical — and it cannot mean "this
 * person works harder", because a human did not choose the volume. What it can
 * legitimately mean is that one MAILBOX's mail is arriving and another's is not:
 * a domain with broken authentication, a mailbox in a spam-foldered reputation
 * hole, a dead token, a warm-up that never finished. That is a real and
 * expensive problem for this client — only 27 of 55 live mailboxes could send
 * when it was last measured — and it is what this feature surfaces.
 *
 * THE NOISE TEST IS THE WHOLE SAFETY PROPERTY.
 * Cold-outreach reply rates are low single digits, so on the volumes a capped
 * mailbox achieves, one sender on 8% and another on 4% is the overwhelmingly
 * likely outcome of two senders who are exactly the same. A screen that printed
 * those two numbers next to two people's names, under an AI paragraph
 * explaining the gap, would manufacture a performance problem out of a coin
 * toss. `compareRateToPool` decides which gaps are real BEFORE the model is
 * asked to explain anything, and the model is told which is which. The filter is
 * here rather than in the prompt for the reason cycle 90 gave: a prompt is
 * advice and a filter is structure.
 *
 * NOTHING HERE CHANGES ANY SENDING. It reads history and produces a table.
 */

/**
 * How far back a client's sending is read. Matches the send-time analysis, and
 * for the same reason: copy and targeting change, so a pattern from three
 * campaigns ago is a different product's data wearing this client's name.
 */
export const REP_LOOKBACK_DAYS = 180;

/**
 * Sends one mailbox needs before it appears at all.
 *
 * Below this the confidence interval on a low-single-digit reply rate is wider
 * than any difference worth discussing, so showing the row would invite a
 * comparison the arithmetic underneath refuses to make.
 */
export const MIN_REP_SENDS = 150;

/** Two, because one sender is not a comparison. */
export const MIN_COMPARABLE_REPS = 2;

/** Total sends across qualifying senders before any comparison is offered. */
export const MIN_TOTAL_SENDS = 400;

/**
 * Total replies needed. Separate from sends because replies are the scarce
 * quantity: a client can send five thousand emails and collect nine replies,
 * and nine replies cannot tell two senders apart however many sends sit under
 * them.
 */
export const MIN_TOTAL_REPLIES = 20;

/**
 * How many standard errors a gap must clear before it is called real.
 *
 * Two, the conventional ~95% two-sided threshold. Stated as a constant rather
 * than buried in an expression because it is the number that decides whether a
 * person's name appears under "sending noticeably fewer replies", and it should
 * be arguable in one place.
 */
export const Z_THRESHOLD = 2;

/** One send, and what became of it. The only input this analysis needs. */
export interface RepSendOutcome {
  readonly mailboxIdentityId: string;
  readonly replied: boolean;
  /**
   * The reply was classified POSITIVE. Deliberately POSITIVE only, not
   * "POSITIVE or INTERESTED_LATER or REFERRAL": those are three different
   * business outcomes, and folding them together would let a sender collecting
   * polite deferrals read as one booking meetings.
   */
  readonly positive: boolean;
  readonly bounced: boolean;
}

/** A mailbox as it is known today, for labelling the table. */
export interface RepIdentity {
  readonly mailboxIdentityId: string;
  readonly label: string;
}

/**
 * How one sender's rate compares with every other qualifying sender pooled.
 *
 * `indistinguishable` is the default and by far the most common answer, and it
 * is a real finding rather than a failure to find one.
 */
export type RepComparison =
  | { readonly kind: "indistinguishable" }
  | { readonly kind: "above"; readonly zScore: number }
  | { readonly kind: "below"; readonly zScore: number };

export interface RepStat {
  readonly mailboxIdentityId: string;
  readonly label: string;
  readonly sent: number;
  readonly replied: number;
  readonly positive: number;
  readonly bounced: number;
  /** Whole percents: the screen shows "12%", not "12.4137%". */
  readonly replyRatePercent: number;
  readonly positiveRatePercent: number;
  readonly bounceRatePercent: number;
  /** On REPLY rate. The headline comparison, and the one people act on. */
  readonly comparison: RepComparison;
  /**
   * On BOUNCE rate, computed separately because it answers a different
   * question. A mailbox bouncing far more than its peers is a deliverability
   * fault, not a performance one, and conflating the two sends somebody to a
   * coaching conversation about a broken DNS record.
   */
  readonly bounceComparison: RepComparison;
}

export type RepEvidenceVerdict =
  | {
      readonly sufficient: true;
      readonly reps: readonly RepStat[];
      readonly totalSent: number;
      readonly totalReplied: number;
      readonly totalPositive: number;
      readonly totalBounced: number;
      /**
       * Whether ANY sender differs from the pool by more than chance, on either
       * measure. False means the honest headline is "these senders are
       * performing the same" — the model is told so, and told not to invent a
       * difference to explain.
       */
      readonly anyDistinguishable: boolean;
    }
  | { readonly sufficient: false; readonly reason: string };

/**
 * Two-proportion comparison: this sender against every other one pooled.
 *
 * The standard two-sample z-test for a difference of proportions, written out
 * rather than pulled from a statistics package — it is six lines, and a
 * dependency added to a billing-adjacent screen has to earn itself.
 *
 * Returns `indistinguishable` whenever the standard error is zero or the pool
 * is empty. Both cases divide by zero and would otherwise report infinite
 * certainty from no evidence at all: a single sender with nobody to compare
 * against, or a client where nobody has replied to anybody.
 */
export function compareRateToPool(args: {
  successes: number;
  trials: number;
  poolSuccesses: number;
  poolTrials: number;
}): RepComparison {
  const { successes, trials, poolSuccesses, poolTrials } = args;
  if (trials <= 0 || poolTrials <= 0) return { kind: "indistinguishable" };

  const rate = successes / trials;
  const poolRate = poolSuccesses / poolTrials;

  const pooled = (successes + poolSuccesses) / (trials + poolTrials);
  // Zero when nobody succeeded anywhere, and when everybody did.
  if (pooled <= 0 || pooled >= 1) return { kind: "indistinguishable" };

  const standardError = Math.sqrt(pooled * (1 - pooled) * (1 / trials + 1 / poolTrials));
  if (standardError <= 0) return { kind: "indistinguishable" };

  const zScore = (rate - poolRate) / standardError;
  if (Math.abs(zScore) < Z_THRESHOLD) return { kind: "indistinguishable" };

  return zScore > 0
    ? { kind: "above", zScore }
    : { kind: "below", zScore };
}

/** Whole-percent rate, guarding the zero-trial case. */
function ratePercent(count: number, of: number): number {
  return of <= 0 ? 0 : Math.round((count / of) * 100);
}

interface Bucket {
  mailboxIdentityId: string;
  sent: number;
  replied: number;
  positive: number;
  bounced: number;
}

/**
 * Turn a client's sends into a comparable table of senders — or refuse.
 *
 * The refusals are ordered so that each names the thing actually missing. "Not
 * enough data" tells an operator nothing; "only one sender has sent enough"
 * tells them to check why the other mailboxes are idle, which on this client is
 * usually a disconnected mailbox and is the real finding.
 */
export function assessRepEvidence(
  outcomes: readonly RepSendOutcome[],
  identities: readonly RepIdentity[],
): RepEvidenceVerdict {
  const labels = new Map(identities.map((i) => [i.mailboxIdentityId, i.label]));

  const buckets = new Map<string, Bucket>();
  for (const outcome of outcomes) {
    const bucket = buckets.get(outcome.mailboxIdentityId) ?? {
      mailboxIdentityId: outcome.mailboxIdentityId,
      sent: 0,
      replied: 0,
      positive: 0,
      bounced: 0,
    };
    bucket.sent += 1;
    if (outcome.replied) bucket.replied += 1;
    if (outcome.positive) bucket.positive += 1;
    if (outcome.bounced) bucket.bounced += 1;
    buckets.set(outcome.mailboxIdentityId, bucket);
  }

  // Thin senders are dropped BEFORE the totals are taken, so the headline
  // numbers add up to the table printed under them.
  const qualifying = [...buckets.values()].filter((b) => b.sent >= MIN_REP_SENDS);

  const totalSent = qualifying.reduce((sum, b) => sum + b.sent, 0);
  const totalReplied = qualifying.reduce((sum, b) => sum + b.replied, 0);
  const totalPositive = qualifying.reduce((sum, b) => sum + b.positive, 0);
  const totalBounced = qualifying.reduce((sum, b) => sum + b.bounced, 0);

  if (totalSent < MIN_TOTAL_SENDS) {
    return {
      sufficient: false,
      reason: `Not enough sending to compare senders — ${String(totalSent)} of the ${String(MIN_TOTAL_SENDS)} needed. Only senders with at least ${String(MIN_REP_SENDS)} emails of their own are counted, because below that a reply rate is mostly luck.`,
    };
  }
  if (totalReplied < MIN_TOTAL_REPLIES) {
    return {
      sufficient: false,
      reason: `Not enough replies yet — ${String(totalReplied)} of the ${String(MIN_TOTAL_REPLIES)} needed before one sender can be told apart from another.`,
    };
  }
  if (qualifying.length < MIN_COMPARABLE_REPS) {
    return {
      sufficient: false,
      reason: `Only one sender has sent enough to be compared, so there is nothing to compare it with. Check whether the other mailboxes are connected and sending.`,
    };
  }

  const reps: RepStat[] = qualifying
    .map((bucket) => {
      const poolTrials = totalSent - bucket.sent;
      return {
        mailboxIdentityId: bucket.mailboxIdentityId,
        label:
          labels.get(bucket.mailboxIdentityId) ??
          // A mailbox removed from the workspace keeps its id on the sends it
          // made. Those sends happened and belong in the totals, so the row is
          // labelled rather than dropped.
          "A mailbox that is no longer in this workspace",
        sent: bucket.sent,
        replied: bucket.replied,
        positive: bucket.positive,
        bounced: bucket.bounced,
        replyRatePercent: ratePercent(bucket.replied, bucket.sent),
        positiveRatePercent: ratePercent(bucket.positive, bucket.sent),
        bounceRatePercent: ratePercent(bucket.bounced, bucket.sent),
        comparison: compareRateToPool({
          successes: bucket.replied,
          trials: bucket.sent,
          poolSuccesses: totalReplied - bucket.replied,
          poolTrials: poolTrials,
        }),
        bounceComparison: compareRateToPool({
          successes: bucket.bounced,
          trials: bucket.sent,
          poolSuccesses: totalBounced - bucket.bounced,
          poolTrials: poolTrials,
        }),
      };
    })
    // Best reply rate first, with deterministic tie-breaks: a table that
    // reshuffles between two renders of the same data is one nobody trusts to
    // read a number off.
    .sort(
      (a, b) =>
        b.replyRatePercent - a.replyRatePercent ||
        b.sent - a.sent ||
        a.mailboxIdentityId.localeCompare(b.mailboxIdentityId),
    );

  return {
    sufficient: true,
    reps,
    totalSent,
    totalReplied,
    totalPositive,
    totalBounced,
    anyDistinguishable: reps.some(
      (r) =>
        r.comparison.kind !== "indistinguishable" ||
        r.bounceComparison.kind !== "indistinguishable",
    ),
  };
}
