import type { SuppressionListKind } from "@/generated/prisma/enums";

/**
 * Warn when a do-not-contact sync SHRANK the list. The sync is a
 * delete-then-replace, so a sheet that lost rows (a fat-fingered edit, the
 * wrong tab, an accidental clear) silently removes blocked addresses and
 * re-opens those people to outreach. The sync previously reported only the new
 * size, so a 1000→50 sync looked like a normal success — for sacrosanct opt-out
 * data that's the costliest silent failure.
 *
 * Returns a staff-facing note, or undefined when nothing was removed.
 */
export function suppressionShrinkWarning(
  kind: SuppressionListKind,
  written: number,
  previousCount: number,
): string | undefined {
  const removed = Math.max(0, previousCount - written);
  if (removed === 0) return undefined;
  const noun =
    kind === "EMAIL"
      ? removed === 1
        ? "address"
        : "addresses"
      : removed === 1
        ? "domain"
        : "domains";
  return `Wrote ${String(written)}, but ${String(removed)} previously-blocked ${noun} ${
    removed === 1 ? "was" : "were"
  } removed because they are no longer in the sheet. If that was not intended, add them back to the sheet and sync again — they can be contacted until you do.`;
}
