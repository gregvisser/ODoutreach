import type { SuppressionListKind } from "@/generated/prisma/enums";

import { suppressionReplaceRefusalMessage } from "@/lib/suppression/staff-sync-copy";

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
 * Compare the actual previous entries with the replacement. New additions
 * must not conceal removals by keeping the total unchanged or making it grow.
 * Callers read the previous entries inside the replacement transaction.
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

  // Even one missing row may be an opt-out. Only the caller's explicit
  // confirmShrink path may remove it; routine sync still adds new blocks.
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
