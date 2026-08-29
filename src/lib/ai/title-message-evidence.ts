/**
 * Which message works for which job title — the arithmetic, computed WITHOUT a
 * model.
 *
 * Queue row 80 item 7. Three properties of THIS application decide what the
 * question is even allowed to mean, and each of them changes the shape of the
 * calculation below. They were checked against the schema before any of this
 * was written.
 *
 * ONE: THE UNIT IS AN ENROLLMENT, NOT A SEND.
 * A contact enrolled in a sequence receives that sequence's steps in order —
 * day 1, 4, 9, 16, 25. Counting those as five independent trials would be
 * counting one person five times, and every standard error downstream would be
 * too small, so every gap would look realer than it is. Worse, item 2 of this
 * same queue row stops the sequence the instant somebody replies, so a contact
 * who replies to step 1 never receives steps 2-5: the later steps' audience is
 * systematically stripped of exactly the people who reply. Comparing step 1's
 * reply rate against step 4's would therefore compare two different populations
 * and reliably conclude that the first email is the best one, whatever it said.
 * So one enrollment is one row: one person, one message-set, one outcome.
 *
 * TWO: "MESSAGE" MEANS THE SEQUENCE, BECAUSE THAT IS WHAT VARIES BETWEEN PEOPLE.
 * Templates and sequences are scoped to the CLIENT, and every contact in a
 * sequence walks the same steps. The only copy dimension that differs between
 * two contacts of the same client is therefore WHICH SEQUENCE they were enrolled
 * in. That is the comparison this file makes, and it is the only message
 * comparison this data model can support.
 *
 * THREE, AND IT IS THE ONE THAT CANNOT BE FIXED, ONLY DECLARED:
 * NOBODY WAS RANDOMISED. A sequence targets a contact LIST that an operator
 * built. So a sequence that wins among Operations people may simply have been
 * pointed at a better list of Operations people — bigger companies, a warmer
 * source, a more recent import. This is a confound, it is not removable by any
 * amount of arithmetic, and a screen that reported "this message wins for
 * Operations" without it would be teaching an operator to rewrite copy in
 * response to a difference in targeting. It is stated as fact in the system
 * prompt and carried into the stored cautions.
 *
 * WHY THE SIGNIFICANCE THRESHOLD MOVES, WHICH IT DID NOT FOR THE SENDER
 * COMPARISON. That feature compared a handful of mailboxes. This one compares
 * every message inside every job-title family — easily dozens of cells. At the
 * conventional two-standard-error threshold, one comparison in twenty clears by
 * chance, so a client with forty cells should expect two spurious "findings"
 * every single time they press the button, and they would be indistinguishable
 * from real ones. `bonferroniZThreshold` raises the bar in proportion to how
 * many comparisons are actually being made, so the false-positive rate is
 * controlled across the whole table rather than one cell at a time.
 *
 * NOTHING HERE CHANGES ANY SENDING. It reads history and produces a table.
 */

import { compareRateToPool, Z_THRESHOLD, type RepComparison } from "./rep-performance-evidence";
import { classifyTitleFamily, titleFamilyLabel, type TitleFamily } from "./title-family";

/**
 * The two-proportion test itself is IDENTICAL to the one the sender comparison
 * uses, so it is imported rather than rewritten. A second copy of a calculation
 * that decides what a client is told about their own campaigns is a second copy
 * to keep correct, and the first one is already covered by tests.
 */
export type { RepComparison as TitleMessageComparison };

/**
 * How far back a client's outreach is read. Matches the send-time analysis and
 * the sender comparison, for the same reason: copy and targeting change, so a
 * pattern from three campaigns ago belongs to a different campaign.
 */
export const TITLE_MESSAGE_LOOKBACK_DAYS = 180;

/**
 * How long an enrollment must have existed before its result counts.
 *
 * A sequence runs to day 25, and a reply can arrive after the last step. So a
 * contact enrolled last week has not finished being emailed, and counting them
 * as "did not reply" records a verdict that has not been reached yet.
 *
 * That is not a rounding error, it is a systematic one with a direction: the
 * newest campaign always has the largest share of unfinished enrollments, so
 * comparing a campaign launched this month against one that finished in the
 * spring would find the older one better every single time, whatever either of
 * them said. Only enrollments older than this are counted, which costs the
 * analysis its most recent five weeks and buys it the only thing that makes the
 * comparison fair.
 *
 * 35 days: the day-25 final step, plus ten days for a reply to arrive.
 */
export const TITLE_MESSAGE_MATURITY_DAYS = 35;

/**
 * Enrollments one (job-title family x message) cell needs before it is shown.
 *
 * Below this, the confidence interval on a low-single-digit reply rate is wide
 * enough to swallow any difference worth acting on, so printing the row would
 * invite a comparison the arithmetic underneath refuses to make.
 */
export const MIN_CELL_ENROLLMENTS = 60;

/** Two. One message in a family is not a comparison. */
export const MIN_MESSAGES_PER_FAMILY = 2;

/** Enrollments across a family's qualifying cells before it is compared. */
export const MIN_FAMILY_ENROLLMENTS = 150;

/**
 * Replies a family needs. Separate from enrollments because replies are the
 * scarce quantity in cold outreach: a family can absorb six hundred emails and
 * return four replies, and four replies cannot tell two messages apart however
 * many enrollments sit under them.
 */
export const MIN_FAMILY_REPLIES = 10;

/** Replies across the whole client before any comparison is offered at all. */
export const MIN_TOTAL_REPLIES = 25;

/** The false-positive rate we are willing to accept ACROSS THE WHOLE TABLE. */
export const FAMILY_WISE_ALPHA = 0.05;

/** One enrollment, and what became of it. The only input this analysis needs. */
export interface TitleMessageOutcome {
  /** Which sequence's copy this person received. */
  readonly sequenceId: string;
  /** The contact's job title, exactly as it is stored — free text or absent. */
  readonly title: string | null;
  /** This contact replied to any send from this enrollment. */
  readonly replied: boolean;
  /**
   * The reply was classified POSITIVE. Deliberately POSITIVE only: folding in
   * "interested later" and "referral" would let a message collecting polite
   * deferrals read as one booking meetings.
   */
  readonly positive: boolean;
}

/** A sequence as it is named today, for labelling the table. */
export interface MessageIdentity {
  readonly sequenceId: string;
  readonly label: string;
}

export interface MessageCellStat {
  readonly sequenceId: string;
  readonly label: string;
  readonly enrollments: number;
  readonly replied: number;
  readonly positive: number;
  /** Whole percents: the screen shows "7%", not "6.8421%". */
  readonly replyRatePercent: number;
  readonly positiveRatePercent: number;
  /** This message against every OTHER message sent to the SAME family. */
  readonly comparison: RepComparison;
}

export interface TitleFamilyStat {
  readonly family: TitleFamily;
  readonly label: string;
  readonly enrollments: number;
  readonly replied: number;
  readonly positive: number;
  readonly replyRatePercent: number;
  readonly messages: readonly MessageCellStat[];
  /** Whether any message in THIS family beat the others by more than chance. */
  readonly anyDistinguishable: boolean;
}

/**
 * How much of the client's outreach this answer is silent about.
 *
 * Reported rather than hidden because it is the number that decides how far the
 * findings generalise. A comparison covering a fifth of the contacts reached is
 * a comparison about a fifth of the contacts reached, and an operator who is not
 * told that will read it as a statement about their whole list.
 */
export interface TitleMessageCoverage {
  readonly totalEnrollments: number;
  /** Contacts with no job title recorded at all. */
  readonly missingTitle: number;
  /** Titles we hold but could not group — see `title-family.ts`. */
  readonly ungrouped: number;
  /** Grouped, but in a family or cell too thin to compare. */
  readonly tooThinToCompare: number;
  /** Enrollments actually inside the compared table. */
  readonly compared: number;
  /** Whole percent of all enrollments that the table covers. */
  readonly comparedPercent: number;
}

export type TitleMessageVerdict =
  | {
      readonly sufficient: true;
      readonly families: readonly TitleFamilyStat[];
      readonly coverage: TitleMessageCoverage;
      readonly totalReplied: number;
      readonly totalPositive: number;
      /** How many cell-vs-pool comparisons were made. Drives the threshold. */
      readonly comparisonCount: number;
      /** The z the gaps actually had to clear, after the multiplicity penalty. */
      readonly zThreshold: number;
      /**
       * Whether ANY message anywhere beat the others by more than chance. False
       * means the honest headline is "these messages are performing the same",
       * however unequal the percentages happen to look.
       */
      readonly anyDistinguishable: boolean;
    }
  | { readonly sufficient: false; readonly reason: string };

/**
 * Inverse of the standard normal CDF — Acklam's rational approximation.
 *
 * Needed to turn "a 5% false-positive rate spread over k comparisons" into the
 * number of standard errors a gap must clear. Written out rather than pulled
 * from a statistics package for the reason the two-proportion test was: it is
 * twenty lines, and a dependency added to the path that decides what a client
 * is told about their campaigns has to earn itself.
 *
 * Accurate to better than 1e-9 over the whole open interval, which is orders of
 * magnitude more precision than a threshold on a z-score needs.
 */
export function inverseNormalCdf(p: number): number {
  if (!(p > 0 && p < 1)) return Number.NaN;

  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      ((((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1))
    );
  }
  if (p > pHigh) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return (
      -((((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1))
    );
  }

  const q = p - 0.5;
  const r = q * q;
  return (
    ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  );
}

/**
 * How many standard errors a gap must clear when `comparisons` of them are made
 * at once.
 *
 * Bonferroni: spend the 5% across every comparison rather than on each one, so
 * the chance of ANY spurious finding in the whole table stays at 5% instead of
 * rising with the size of the table. Conservative — it will miss some real
 * differences — and that is the right direction of error here, because the cost
 * of a missed finding is a campaign that stays as it is, while the cost of a
 * false one is an operator rewriting copy that was never the problem.
 *
 * Never returns less than the conventional single-comparison threshold, so one
 * comparison is judged exactly as the sender comparison judges one.
 */
export function bonferroniZThreshold(comparisons: number): number {
  if (!Number.isFinite(comparisons) || comparisons <= 1) return Z_THRESHOLD;
  const perComparison = FAMILY_WISE_ALPHA / comparisons;
  const z = inverseNormalCdf(1 - perComparison / 2);
  return Number.isFinite(z) ? Math.max(Z_THRESHOLD, z) : Z_THRESHOLD;
}

/** Whole-percent rate, guarding the zero-trial case. */
function ratePercent(count: number, of: number): number {
  return of <= 0 ? 0 : Math.round((count / of) * 100);
}

/**
 * Re-judge a comparison against a raised threshold.
 *
 * `compareRateToPool` answers at the conventional two-standard-error bar. When
 * many cells are compared at once that bar is too low, so a gap that cleared it
 * but not the multiplicity-adjusted one is demoted to indistinguishable. Done
 * here rather than by reimplementing the test, so there stays exactly one copy
 * of the arithmetic.
 */
function applyThreshold(comparison: RepComparison, zThreshold: number): RepComparison {
  if (comparison.kind === "indistinguishable") return comparison;
  return Math.abs(comparison.zScore) >= zThreshold
    ? comparison
    : { kind: "indistinguishable" };
}

interface Cell {
  sequenceId: string;
  enrollments: number;
  replied: number;
  positive: number;
}

interface FamilyBucket {
  family: TitleFamily;
  cells: Map<string, Cell>;
}

/**
 * Turn a client's enrollments into a comparable table of messages per job-title
 * family — or refuse.
 *
 * The refusals name the thing actually missing. "Not enough data" tells an
 * operator nothing they can act on; "no job-title group has had two different
 * campaigns sent to it" tells them the answer needs a second campaign aimed at
 * the same audience, which is a thing they can go and do.
 *
 * THE PASSES ARE ORDERED, and the order is the safety property. Cells and
 * families are filtered to the ones that qualify BEFORE the comparison count is
 * known, because the comparison count sets the threshold, and a threshold
 * computed over cells that were then dropped would be judging the survivors
 * against a penalty for tests that never happened.
 */
export function assessTitleMessageEvidence(
  outcomes: readonly TitleMessageOutcome[],
  messages: readonly MessageIdentity[],
): TitleMessageVerdict {
  const labels = new Map(messages.map((m) => [m.sequenceId, m.label]));

  const totalEnrollments = outcomes.length;
  let missingTitle = 0;
  let ungrouped = 0;

  const families = new Map<TitleFamily, FamilyBucket>();

  for (const outcome of outcomes) {
    const rawTitle = outcome.title?.trim() ?? "";
    if (!rawTitle) {
      missingTitle += 1;
      continue;
    }
    const family = classifyTitleFamily(rawTitle);
    if (family === null) {
      ungrouped += 1;
      continue;
    }

    const bucket = families.get(family) ?? { family, cells: new Map<string, Cell>() };
    const cell = bucket.cells.get(outcome.sequenceId) ?? {
      sequenceId: outcome.sequenceId,
      enrollments: 0,
      replied: 0,
      positive: 0,
    };
    cell.enrollments += 1;
    if (outcome.replied) cell.replied += 1;
    if (outcome.positive) cell.positive += 1;
    bucket.cells.set(outcome.sequenceId, cell);
    families.set(family, bucket);
  }

  const grouped = totalEnrollments - missingTitle - ungrouped;

  // FIRST PASS: which families can be compared at all. Thin cells are dropped
  // before a family's totals are taken, so the headline numbers add up to the
  // rows printed under them.
  const qualifying: { bucket: FamilyBucket; cells: Cell[] }[] = [];
  for (const bucket of families.values()) {
    const cells = [...bucket.cells.values()].filter(
      (c) => c.enrollments >= MIN_CELL_ENROLLMENTS,
    );
    if (cells.length < MIN_MESSAGES_PER_FAMILY) continue;

    const enrollments = cells.reduce((sum, c) => sum + c.enrollments, 0);
    const replied = cells.reduce((sum, c) => sum + c.replied, 0);
    if (enrollments < MIN_FAMILY_ENROLLMENTS) continue;
    if (replied < MIN_FAMILY_REPLIES) continue;

    qualifying.push({ bucket, cells });
  }

  if (totalEnrollments === 0) {
    return {
      sufficient: false,
      reason:
        "Nobody has been enrolled in a campaign in this window, so there is nothing to compare.",
    };
  }

  if (qualifying.length === 0) {
    return {
      sufficient: false,
      reason: describeWhyNothingQualified({
        families,
        grouped,
        missingTitle,
        ungrouped,
        totalEnrollments,
      }),
    };
  }

  const comparedEnrollments = qualifying.reduce(
    (sum, q) => sum + q.cells.reduce((s, c) => s + c.enrollments, 0),
    0,
  );
  const totalReplied = qualifying.reduce(
    (sum, q) => sum + q.cells.reduce((s, c) => s + c.replied, 0),
    0,
  );
  const totalPositive = qualifying.reduce(
    (sum, q) => sum + q.cells.reduce((s, c) => s + c.positive, 0),
    0,
  );

  if (totalReplied < MIN_TOTAL_REPLIES) {
    return {
      sufficient: false,
      reason: `Not enough replies yet — ${String(totalReplied)} of the ${String(MIN_TOTAL_REPLIES)} needed before one campaign can be told apart from another. Reply rates in cold outreach are low, so this usually means waiting rather than changing anything.`,
    };
  }

  // SECOND PASS: the threshold, now that the surviving cells are known.
  const comparisonCount = qualifying.reduce((sum, q) => sum + q.cells.length, 0);
  const zThreshold = bonferroniZThreshold(comparisonCount);

  const familyStats: TitleFamilyStat[] = qualifying
    .map(({ bucket, cells }) => {
      const enrollments = cells.reduce((sum, c) => sum + c.enrollments, 0);
      const replied = cells.reduce((sum, c) => sum + c.replied, 0);
      const positive = cells.reduce((sum, c) => sum + c.positive, 0);

      const messageStats: MessageCellStat[] = cells
        .map((cell) => ({
          sequenceId: cell.sequenceId,
          label:
            labels.get(cell.sequenceId) ??
            // A deleted sequence keeps its id on the enrollments it made. Those
            // enrollments happened and belong in the totals, so the row is
            // labelled rather than dropped.
            "A campaign that is no longer in this workspace",
          enrollments: cell.enrollments,
          replied: cell.replied,
          positive: cell.positive,
          replyRatePercent: ratePercent(cell.replied, cell.enrollments),
          positiveRatePercent: ratePercent(cell.positive, cell.enrollments),
          comparison: applyThreshold(
            compareRateToPool({
              successes: cell.replied,
              trials: cell.enrollments,
              poolSuccesses: replied - cell.replied,
              poolTrials: enrollments - cell.enrollments,
            }),
            zThreshold,
          ),
        }))
        // Best reply rate first, with deterministic tie-breaks: a table that
        // reshuffles between two renders of the same data is one nobody trusts
        // to read a number off.
        .sort(
          (a, b) =>
            b.replyRatePercent - a.replyRatePercent ||
            b.enrollments - a.enrollments ||
            a.sequenceId.localeCompare(b.sequenceId),
        );

      return {
        family: bucket.family,
        label: titleFamilyLabel(bucket.family),
        enrollments,
        replied,
        positive,
        replyRatePercent: ratePercent(replied, enrollments),
        messages: messageStats,
        anyDistinguishable: messageStats.some(
          (m) => m.comparison.kind !== "indistinguishable",
        ),
      };
    })
    .sort(
      (a, b) =>
        b.enrollments - a.enrollments || a.family.localeCompare(b.family),
    );

  return {
    sufficient: true,
    families: familyStats,
    coverage: {
      totalEnrollments,
      missingTitle,
      ungrouped,
      tooThinToCompare: grouped - comparedEnrollments,
      compared: comparedEnrollments,
      comparedPercent: ratePercent(comparedEnrollments, totalEnrollments),
    },
    totalReplied,
    totalPositive,
    comparisonCount,
    zThreshold,
    anyDistinguishable: familyStats.some((f) => f.anyDistinguishable),
  };
}

/**
 * Say which of the several reasons a client has no comparable table.
 *
 * Each branch names a different thing to go and do, and they are ordered by how
 * far the client is from an answer — the first one that applies is the one
 * blocking them.
 */
function describeWhyNothingQualified(args: {
  families: ReadonlyMap<TitleFamily, FamilyBucket>;
  grouped: number;
  missingTitle: number;
  ungrouped: number;
  totalEnrollments: number;
}): string {
  const { families, grouped, missingTitle, ungrouped, totalEnrollments } = args;

  if (grouped === 0) {
    const missingPercent = ratePercent(missingTitle, totalEnrollments);
    return missingTitle > ungrouped
      ? `No job titles are recorded for the people enrolled in campaigns — ${String(missingPercent)}% of them have no title at all. Importing titles with your contacts is what makes this comparison possible.`
      : `None of the job titles on record could be grouped into an audience. This comparison needs recognisable titles such as "Operations Manager" or "Finance Director" rather than free-text descriptions.`;
  }

  // How close is the best family? Reported so the answer is "you need roughly
  // this much more", not "no".
  let bestFamily: TitleFamily | null = null;
  let bestCells = 0;
  let bestEnrollments = 0;
  for (const bucket of families.values()) {
    const cells = [...bucket.cells.values()].filter(
      (c) => c.enrollments >= MIN_CELL_ENROLLMENTS,
    );
    const enrollments = cells.reduce((sum, c) => sum + c.enrollments, 0);
    if (cells.length > bestCells || (cells.length === bestCells && enrollments > bestEnrollments)) {
      bestFamily = bucket.family;
      bestCells = cells.length;
      bestEnrollments = enrollments;
    }
  }

  if (bestFamily === null || bestCells < MIN_MESSAGES_PER_FAMILY) {
    return `No job-title group has had two different campaigns sent to at least ${String(MIN_CELL_ENROLLMENTS)} people each, so there is nothing to compare one message against. Running a second campaign at the same kind of audience is what makes this answerable.`;
  }

  return `The largest comparable audience (${titleFamilyLabel(bestFamily)}) has ${String(bestEnrollments)} people across its campaigns, of the ${String(MIN_FAMILY_ENROLLMENTS)} needed. Below that, a difference in reply rate is mostly luck.`;
}
