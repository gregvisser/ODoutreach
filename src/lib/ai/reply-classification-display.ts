import {
  HUMAN_ATTENTION_LABELS,
  replyClassificationLabel,
  type ReplyClassificationLabel,
} from "./reply-classification";

/**
 * How a classification looks on screen.
 *
 * Split from the component so the rule that actually matters — which labels
 * shout for attention — is testable without rendering anything. The whole
 * feature is a routing decision, and the routing happens in a staff member's
 * eyes scanning a list.
 */

export interface ReplyClassificationBadge {
  readonly text: string;
  /** Tailwind classes. Warm replies are loud; rejections are quiet. */
  readonly className: string;
  /** True when a person should look at this soon. */
  readonly needsHuman: boolean;
}

/**
 * Colour carries meaning here, so it is never the ONLY signal: the badge always
 * carries its words too. A staff member with a colour vision deficiency reads
 * "Interested now" exactly as fast.
 */
export function replyClassificationBadge(
  value: ReplyClassificationLabel,
): ReplyClassificationBadge {
  const text = replyClassificationLabel(value);
  const needsHuman = HUMAN_ATTENTION_LABELS.has(value);

  switch (value) {
    case "POSITIVE":
      return {
        text,
        needsHuman,
        className:
          "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      };
    case "REFERRAL":
      return {
        text,
        needsHuman,
        className: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
      };
    case "INTERESTED_LATER":
      return {
        text,
        needsHuman,
        className: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      };
    case "UNSUBSCRIBE":
      return {
        text,
        needsHuman,
        className: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
      };
    case "UNCLEAR":
      // Deliberately not grey. UNCLEAR means "a person has to read this", which
      // is a job to do — the same status as POSITIVE, not the same as a closed
      // rejection. Muting it would re-create the bury-the-warm-reply failure
      // that having an UNCLEAR label exists to prevent.
      return {
        text,
        needsHuman,
        className: "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300",
      };
    case "NOT_INTERESTED":
      return {
        text,
        needsHuman,
        className: "border-border bg-muted text-muted-foreground",
      };
  }
}

/**
 * What to show when a reply has no label at all.
 *
 * Says "not checked yet" rather than nothing, because a blank cell reads as
 * "no reply of interest" — and an unclassified reply is precisely one nobody
 * has assessed. The honest state on screen is the spec's rule for a feature
 * that cannot run: show it, and say why.
 */
export const UNCLASSIFIED_BADGE: ReplyClassificationBadge = {
  text: "Not checked yet",
  needsHuman: true,
  className: "border-dashed border-border bg-transparent text-muted-foreground",
};
