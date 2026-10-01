import type { SuppressionListKind } from "@/generated/prisma/enums";

import { suppressionReplaceRefusalMessage } from "@/lib/suppression/staff-sync-copy";

/**
 * Whether a do-not-contact sheet sync may replace what this sheet stored.
 *
 * OpensDoors staff shorten these sheets on purpose. A shorter non-empty sheet
 * is mirrored: rows they took off are taken off this sheet's blocks.
 *
 * An empty read is not. A sheet that cannot be read, a renamed tab, or a tab
 * that comes back with no usable rows when rows were stored would otherwise
 * delete the whole list. That case is refused and the stored rows stay.
 * Callers still apply the refusal before any delete, inside the transaction.
 */

export type SuppressionReplaceRefusal = {
  previousCount: number;
  wouldWrite: number;
  removed: number;
  reason: string;
};

export type SuppressionReplaceDecision =
  | { allowed: true }
  | { allowed: false; refusal: SuppressionReplaceRefusal };

export function decideSuppressionReplace(
  kind: SuppressionListKind,
  nextEntries: ReadonlySet<string>,
  previousEntries: readonly string[],
): SuppressionReplaceDecision {
  const previousCount = previousEntries.length;
  const wouldWrite = nextEntries.size;
  // Nothing stored means nothing to lose. This is the state of a client whose
  // list has never synced — the fix must be able to fill it.
  if (previousCount <= 0) return { allowed: true };

  const removed = previousEntries.filter((entry) => !nextEntries.has(entry)).length;
  if (removed <= 0) return { allowed: true };

  // A header with no usable rows, or a cleared sheet, is not a list. Keep
  // every stored block. A shorter sheet that still has rows is applied.
  if (wouldWrite > 0) return { allowed: true };

  return {
    allowed: false,
    refusal: {
      previousCount,
      wouldWrite,
      removed,
      reason: suppressionReplaceRefusalMessage(kind, previousCount, wouldWrite, removed),
    },
  };
}
