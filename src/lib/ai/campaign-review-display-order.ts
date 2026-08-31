/**
 * Display order for the "Score a campaign's writing with AI" panel
 * (queue item 133, finding 1).
 *
 * Greg's words: grading five sequences turns the panel into one long screen
 * and he has to hunt for the one he just graded. Pure ordering logic so the
 * "most recently reviewed floats to the top" rule is testable without
 * rendering a component: sequences with a review come first, most recently
 * reviewed first; sequences with no review keep their original relative
 * order at the end.
 */

export function orderSequencesByReviewRecency<T extends { id: string }>(
  sequences: readonly T[],
  reviewedAtBySequenceId: ReadonlyMap<string, Date>,
): T[] {
  const reviewed = sequences.filter((s) => reviewedAtBySequenceId.has(s.id));
  const unreviewed = sequences.filter((s) => !reviewedAtBySequenceId.has(s.id));

  reviewed.sort((a, b) => {
    const at = reviewedAtBySequenceId.get(a.id)?.getTime() ?? 0;
    const bt = reviewedAtBySequenceId.get(b.id)?.getTime() ?? 0;
    return bt - at;
  });

  return [...reviewed, ...unreviewed];
}

/**
 * Only the single most-recently-reviewed sequence opens by default; every
 * other review starts collapsed. `sequenceIdInDisplayOrder` must already be
 * the output of `orderSequencesByReviewRecency`.
 */
export function isMostRecentlyReviewed(
  sequenceId: string,
  sequenceIdsInDisplayOrder: readonly string[],
  reviewedAtBySequenceId: ReadonlyMap<string, Date>,
): boolean {
  const first = sequenceIdsInDisplayOrder.find((id) =>
    reviewedAtBySequenceId.has(id),
  );
  return first !== undefined && first === sequenceId;
}
