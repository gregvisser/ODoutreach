import type { SuppressionListKind } from "@/generated/prisma/enums";

function noun(kind: SuppressionListKind, count: number): string {
  if (kind === "EMAIL") {
    return count === 1 ? "address" : "addresses";
  }
  return count === 1 ? "domain" : "domains";
}

/**
 * Staff-facing refusal when a sheet sync would drop rows that are already
 * blocked. Fail-closed: nothing is deleted until an owner explicitly confirms.
 */
export function suppressionReplaceRefusalMessage(
  kind: SuppressionListKind,
  previousCount: number,
  wouldWrite: number,
  removed: number,
): string {
  const blockNoun = noun(kind, previousCount);
  const sheetNoun = noun(kind, wouldWrite);

  if (wouldWrite === 0) {
    return (
      `Sync stopped: the Google Sheet did not contain any usable ${sheetNoun}, so applying it would have removed all ${String(previousCount)} blocked ${blockNoun}. ` +
      `Nothing was changed — those ${String(previousCount)} ${blockNoun} are still blocked. ` +
      `Check the Sheet still holds the list and that the tab and range are correct, then sync again.`
    );
  }

  return (
    `Sync stopped: the Sheet is missing ${String(removed)} of the ${String(previousCount)} ${blockNoun} we already block. ` +
    `The Sheet would load ${String(wouldWrite)} ${sheetNoun}. Nothing was changed — all ${String(previousCount)} stay blocked. ` +
    `If that was a mistake in the Sheet, add the missing rows back and sync again. ` +
    `Only if you deliberately rebuilt the list and want those ${String(removed)} ${noun(kind, removed)} to become contactable again, use the separate confirmation control on this screen — not a normal Sync.`
  );
}

/**
 * After a successful sync that loaded fewer rows than before (but passed the
 * guard because the operator already confirmed). Warns that some blocks were
 * removed from the stored list.
 */
export function suppressionListShortenedWarning(
  kind: SuppressionListKind,
  written: number,
  previousCount: number,
): string | undefined {
  const removed = Math.max(0, previousCount - written);
  if (removed === 0) return undefined;
  const blockNoun = noun(kind, removed);
  return (
    `Loaded ${String(written)} rows from the Sheet, but ${String(removed)} previously blocked ${blockNoun} ` +
    `${removed === 1 ? "is" : "are"} no longer on the list and can be contacted until you block them again. ` +
    `If that was not intended, put them back in the Sheet and sync again.`
  );
}

/** Destructive confirmation — only shown after a refused sync, never by default. */
export function suppressionConfirmRemovalButtonLabel(removed: number): string {
  return `Yes — allow ${String(removed)} to be contacted again`;
}

export function suppressionConfirmRemovalPanelTitle(): string {
  return "Nothing was deleted. Everyone on the list is still blocked.";
}

export function suppressionConfirmRemovalPanelBody(
  removed: number,
  kind: SuppressionListKind,
): string {
  const blockNoun = noun(kind, removed);
  return (
    `Put the missing rows back in the Google Sheet and press Sync again if this was a mistake. ` +
    `Use the button below only when you are certain those ${String(removed)} ${blockNoun} should become contactable again — that cannot be undone from here.`
  );
}
