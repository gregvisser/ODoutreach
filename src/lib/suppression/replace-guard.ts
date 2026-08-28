import type { SuppressionListKind } from "@/generated/prisma/enums";

/**
 * Whether a do-not-contact sheet sync is allowed to replace what is stored.
 *
 * The sync is delete-then-insert. That makes every read failure a DELETION:
 * point it at the wrong tab, or read a sheet somebody has just cleared, and
 * every blocked address silently becomes sendable again on a live cold-email
 * system. `suppressionShrinkWarning` reports that after the fact, which is a
 * receipt, not a guard.
 *
 * So the replace refuses. Blocking someone who need not be blocked is a
 * nuisance; contacting someone who asked never to be contacted is the failure
 * the product exists to prevent, and it cannot be undone. Fail toward keeping
 * people blocked, every time.
 *
 * KNOWN LIMIT, stated rather than implied: this compares COUNTS, so a sync
 * that replaces 373 entries with 373 completely different ones passes. That
 * catches the failure actually seen in production — a misresolved tab reading
 * as empty or near-empty — and not a same-size substitution, which would need
 * the previous rows read and diffed. If that case ever appears, this is the
 * function to change.
 */

/**
 * Below this, a list is small enough that ordinary editing looks like a large
 * proportional shrink — 6 rows down to 4 is somebody tidying up, not an
 * outage. Absolute floor so small lists stay usable.
 */
const ALWAYS_ALLOWED_REMOVALS = 5;

/** Above the floor, the share of a list an ordinary edit may remove. */
const MAX_REMOVAL_FRACTION = 0.1;

export type SuppressionReplaceRefusal = {
  previousCount: number;
  wouldWrite: number;
  removed: number;
  reason: string;
};

export type SuppressionReplaceDecision =
  | { allowed: true }
  | { allowed: false; refusal: SuppressionReplaceRefusal };

/** How many rows this list may lose in one sync before the replace refuses. */
export function allowedRemovals(previousCount: number): number {
  return Math.max(
    ALWAYS_ALLOWED_REMOVALS,
    Math.floor(previousCount * MAX_REMOVAL_FRACTION),
  );
}

export function decideSuppressionReplace(
  kind: SuppressionListKind,
  wouldWrite: number,
  previousCount: number,
): SuppressionReplaceDecision {
  // Nothing stored means nothing to lose. This is the state of a client whose
  // list has never synced — the fix must be able to fill it.
  if (previousCount <= 0) return { allowed: true };

  const removed = previousCount - wouldWrite;
  if (removed <= 0) return { allowed: true };

  const noun = kind === "EMAIL" ? "addresses" : "domains";
  const limit = allowedRemovals(previousCount);

  // Zero is refused on its own terms rather than by the percentage, because it
  // is the signature of a read that went wrong — an empty tab, a cleared
  // sheet, a range pointing at nothing — far more often than of a client
  // deciding nobody is blocked any more.
  if (wouldWrite === 0) {
    return {
      allowed: false,
      refusal: {
        previousCount,
        wouldWrite,
        removed,
        reason:
          `Sync refused: the sheet produced no usable ${noun}, which would have removed all ${String(previousCount)} currently-blocked ${noun}. ` +
          `Nothing was deleted — the ${String(previousCount)} are still blocked. ` +
          `Check the sheet still holds the list and that the tab and range are right, then sync again.`,
      },
    };
  }

  if (removed > limit) {
    return {
      allowed: false,
      refusal: {
        previousCount,
        wouldWrite,
        removed,
        reason:
          `Sync refused: this would have removed ${String(removed)} of ${String(previousCount)} blocked ${noun}, leaving ${String(wouldWrite)}. ` +
          `Nothing was deleted — the ${String(previousCount)} are still blocked. ` +
          `If rows were removed from the sheet by mistake, put them back and sync again. If the removal is deliberate, use "Remove them anyway" to confirm it.`,
      },
    };
  }

  return { allowed: true };
}
