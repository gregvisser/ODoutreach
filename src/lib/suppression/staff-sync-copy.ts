import type { SuppressionListKind } from "@/generated/prisma/enums";

function noun(kind: SuppressionListKind, count: number): string {
  if (kind === "EMAIL") {
    return count === 1 ? "address" : "addresses";
  }
  return count === 1 ? "domain" : "domains";
}

function heldShrinkFollowUp(kind: SuppressionListKind, removed: number): string {
  const blockNoun = noun(kind, removed);
  return (
    `If those rows were removed by mistake, restore them in the sheet and sync. ` +
    `If they really should be unblocked, check with the client first. ` +
    `Only if you deliberately rebuilt the list and want those ${String(removed)} ${blockNoun} to become contactable again, use the separate confirmation control on this screen — not a normal Sync.`
  );
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
  const kindScope = kind === "EMAIL" ? "email" : "domain";

  if (wouldWrite === 0) {
    return (
      `Sending continues. Your Do Not Contact sheet did not contain any usable ${sheetNoun}, ` +
      `but we still hold ${String(previousCount)} blocked ${blockNoun} from before, so those stay blocked to be safe. ` +
      `Check the sheet tab and range, restore the list if it was cleared by mistake, then sync again. ` +
      `If those ${blockNoun} really should be unblocked, check with the client first before using the confirmation control on this screen.`
    );
  }

  return (
    `Sending continues. Your Do Not Contact sheet is shorter than the ${kindScope} list we hold, ` +
    `so we're keeping the missing ${String(removed)} ${noun(kind, removed)} blocked to be safe. ` +
    heldShrinkFollowUp(kind, removed)
  );
}

/**
 * Client-level summary when one or both sheet syncs are in the held-shrink
 * state. Uses combined email + domain counts when both are present.
 */
export function suppressionHeldShrinkCombinedStaffMessage(args: {
  emailRemoved?: number;
  domainRemoved?: number;
}): string {
  const emailRemoved = args.emailRemoved ?? 0;
  const domainRemoved = args.domainRemoved ?? 0;
  const hasEmail = emailRemoved > 0;
  const hasDomain = domainRemoved > 0;

  const followUp =
    "If those rows were removed by mistake, restore them in the sheet and sync. " +
    "If they really should be unblocked, check with the client first.";

  if (hasEmail && hasDomain) {
    const emailWord = emailRemoved === 1 ? "email" : "emails";
    const domainWord = domainRemoved === 1 ? "domain" : "domains";
    return (
      `Sending continues. Your Do Not Contact sheet is shorter than the list we hold, ` +
      `so we're keeping the missing ${String(emailRemoved)} ${emailWord} and ${String(domainRemoved)} ${domainWord} blocked to be safe. ` +
      followUp
    );
  }

  if (hasEmail) {
    const emailWord = emailRemoved === 1 ? "email" : "emails";
    return (
      `Sending continues. Your Do Not Contact sheet is shorter than the list we hold, ` +
      `so we're keeping the missing ${String(emailRemoved)} ${emailWord} blocked to be safe. ` +
      followUp
    );
  }

  if (hasDomain) {
    const domainWord = domainRemoved === 1 ? "domain" : "domains";
    return (
      `Sending continues. Your Do Not Contact sheet is shorter than the list we hold, ` +
      `so we're keeping the missing ${String(domainRemoved)} ${domainWord} blocked to be safe. ` +
      followUp
    );
  }

  return (
    "Sending continues. Your Do Not Contact sheet is shorter than the list we hold, " +
    "so we're keeping the existing blocks in place to be safe. " +
    followUp
  );
}

/**
 * True when `lastError` is a fail-closed refused shrink (not auth, sharing, or
 * range failure). Recognises current copy and legacy "Sync stopped" refusals.
 */
export function isSuppressionHeldShrinkLastError(
  lastError: string | null | undefined,
): boolean {
  const text = lastError?.trim();
  if (!text) return false;
  if (text.startsWith("Sending continues.")) return true;
  if (!text.startsWith("Sync stopped:")) return false;
  return (
    text.includes("stay blocked") ||
    text.includes("still blocked") ||
    text.includes("Nothing was changed")
  );
}

type HeldShrinkParse = {
  previousCount: number;
  wouldWrite: number;
  removed: number;
};

function parseLegacyHeldShrinkLastError(
  kind: SuppressionListKind,
  lastError: string,
): HeldShrinkParse | undefined {
  const missing = lastError.match(/missing (\d+) of the (\d+)/i);
  const wouldLoad = lastError.match(/would load (\d+)/i);
  if (missing && wouldLoad) {
    return {
      removed: Number(missing[1]),
      previousCount: Number(missing[2]),
      wouldWrite: Number(wouldLoad[1]),
    };
  }

  const empty =
    lastError.match(/removed all (\d+) blocked/i) ??
    lastError.match(/all (\d+) (?:addresses|domains) are still blocked/i);
  if (empty) {
    const previousCount = Number(empty[1]);
    return { previousCount, wouldWrite: 0, removed: previousCount };
  }

  const kept = lastError.match(/keeping the missing (\d+)/i);
  if (kept) {
    const removed = Number(kept[1]);
    return { removed, previousCount: removed, wouldWrite: 0 };
  }

  return undefined;
}

/** Parse removed row count from stored `lastError`, when it is a held shrink. */
export function parseSuppressionHeldShrinkRemovedCount(
  kind: SuppressionListKind,
  lastError: string | null | undefined,
): number | undefined {
  if (!isSuppressionHeldShrinkLastError(lastError)) return undefined;
  const text = lastError!.trim();
  const parsed = parseLegacyHeldShrinkLastError(kind, text);
  return parsed?.removed;
}

/**
 * Staff UI should not show legacy "Sync stopped" refusals after deploy — rewrite
 * using the same generator as live sync, without changing stored DB text.
 */
export function suppressionStaffFacingSyncLastError(
  kind: SuppressionListKind,
  lastError: string | null | undefined,
): string | null {
  if (!lastError?.trim()) return null;
  if (!isSuppressionHeldShrinkLastError(lastError)) return lastError;
  if (lastError.startsWith("Sending continues.")) return lastError;
  const parsed = parseLegacyHeldShrinkLastError(kind, lastError);
  if (!parsed) return lastError;
  return suppressionReplaceRefusalMessage(
    kind,
    parsed.previousCount,
    parsed.wouldWrite,
    parsed.removed,
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
