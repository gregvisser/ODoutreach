/**
 * Reading the numbers back out of a run's check annotations.
 *
 * GitHub reports a run only as success or failure — it has no idea a batch was
 * partial. So a workflow emits `::error title=PARTIAL::<line>` lines, which
 * become check annotations, and this reads them back.
 *
 * ## Why this is a module with tests rather than a few lines in the script
 *
 * Live on 2026-08-25 the annotations came back in REVERSE order: the five
 * per-mailbox reasons first, the counting line last. The parser took the first
 * line that matched a number pair and only produced the right answer because
 * no reason string happened to contain "N of M". A mailbox called
 * `3of5@example.com`, or a provider error quoting "2 of 3 attempts", would have
 * put a wrong number in the subject line of an alert.
 *
 * The count is the entire point of the alert. It does not get to depend on the
 * order a REST API happened to return, or on what a provider put in an error
 * string.
 */

/** The shape the workflow writes for the counting line. */
const SUMMARY = /partial:\s*(\d+)\s+of\s+(\d+)/i;
/** The shape it writes when there is a count but no total. */
const SUMMARY_ITEMS = /partial:\s*(\d+)\s+item/i;

export type PartialAnnotation = { title?: string; message?: string };

export type PartialDetail = {
  failedCount?: number;
  totalCount?: number;
  /** Human-readable reasons, summary lines excluded. */
  reasons: string[];
};

/**
 * Pull the count and the reasons out of a run's PARTIAL annotations.
 *
 * The counting line is identified by its SHAPE (`partial: N of M`), not by its
 * position, and it is not repeated as a reason — the count already appears in
 * the subject and on the job's own line, so echoing it a third time crowds out
 * an actual reason.
 */
export function readPartialAnnotations(
  annotations: readonly PartialAnnotation[],
  maxReasons = 10,
): PartialDetail {
  const detail: PartialDetail = { reasons: [] };

  for (const annotation of annotations) {
    if (annotation.title !== "PARTIAL") continue;
    const message = annotation.message?.trim();
    if (!message) continue;

    const pair = SUMMARY.exec(message);
    if (pair) {
      // Highest wins, so the alert can never under-report by picking a smaller
      // number off a second job. Under-reporting a failure is the mistake that
      // started all of this.
      const failed = Number(pair[1]);
      if (detail.failedCount === undefined || failed > detail.failedCount) {
        detail.failedCount = failed;
        detail.totalCount = Number(pair[2]);
      }
      continue;
    }

    const items = SUMMARY_ITEMS.exec(message);
    if (items) {
      const failed = Number(items[1]);
      if (detail.failedCount === undefined || failed > detail.failedCount) {
        detail.failedCount = failed;
      }
      continue;
    }

    if (detail.reasons.length < maxReasons) detail.reasons.push(message);
  }

  return detail;
}
