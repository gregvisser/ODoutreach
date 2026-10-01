import type { SuppressionListKind } from "@/generated/prisma/enums";

import {
  decideSuppressionReplace,
  type SuppressionReplaceRefusal,
} from "@/lib/suppression/replace-guard";

/**
 * What a do-not-contact sheet sync may change.
 *
 * A non-empty sheet is the client's list: rows they removed are removed from
 * that sheet's stored blocks. An empty read (including a header with no usable
 * rows) is not applied. Entries in `protectedEntries` came from an unsubscribe,
 * a reply opt-out, a bounce, or a manual block as well as the sheet, and stay.
 */
export type SheetMirrorPlan =
  | { apply: false; refusal: SuppressionReplaceRefusal }
  | {
      apply: true;
      /** Sheet rows to delete. Never includes a protected entry. */
      remove: string[];
      /** Absent from the sheet, but kept because another source still blocks them. */
      keptProtected: string[];
      previousCount: number;
    };

export function planSheetMirror(
  kind: SuppressionListKind,
  next: ReadonlySet<string>,
  previous: readonly string[],
  protectedEntries: ReadonlySet<string> = new Set(),
): SheetMirrorPlan {
  const decision = decideSuppressionReplace(kind, next, previous);
  if (!decision.allowed) return { apply: false, refusal: decision.refusal };

  const remove: string[] = [];
  const keptProtected: string[] = [];
  for (const entry of previous) {
    if (next.has(entry)) continue;
    if (protectedEntries.has(entry)) keptProtected.push(entry);
    else remove.push(entry);
  }
  return {
    apply: true,
    remove,
    keptProtected,
    previousCount: previous.length,
  };
}
