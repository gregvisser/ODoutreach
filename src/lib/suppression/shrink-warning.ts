import type { SuppressionListKind } from "@/generated/prisma/enums";

import { suppressionListShortenedWarning } from "@/lib/suppression/staff-sync-copy";

/**
 * Warn when a do-not-contact sync loaded fewer rows than were stored before.
 * The sync is delete-then-replace, so a sheet that lost rows (a fat-fingered
 * edit, the wrong tab, an accidental clear) can reopen people to outreach.
 *
 * Returns a staff-facing note, or undefined when nothing was removed.
 */
export function suppressionShrinkWarning(
  kind: SuppressionListKind,
  written: number,
  previousCount: number,
): string | undefined {
  return suppressionListShortenedWarning(kind, written, previousCount);
}
