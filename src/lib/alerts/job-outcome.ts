/**
 * Deciding whether a scheduled run actually succeeded.
 *
 * ## The burn this exists to stop
 *
 * A job went green while **8 of 35 mailboxes were failing reply sync**. The
 * errors were inside an HTTP 200 body. Every internal job route ends the same
 * way:
 *
 * ```ts
 * return NextResponse.json({ ok: true, ...result });
 * ```
 *
 * `ok: true` is a literal, written before anyone looks at `result`. The GitHub
 * workflow checks only the HTTP status, gets 200, and ticks green.
 *
 * The data was never missing: `ReplySyncBatchResult` carries `failed`, and the
 * queue processor carries `errors: string[]`. Nothing read them.
 *
 * So this reads them. **If any item in a batch failed, the run is not a
 * success** — and the status code says so, because a workflow should not have
 * to parse a body to notice.
 */

/**
 * Multi-Status. Some items succeeded, some did not.
 *
 * Deliberately NOT 500: nothing is broken on the server, and calling a partial
 * batch a server error would make a genuine outage indistinguishable from one
 * expired mailbox token.
 *
 * NOTE, and this cost a wrong comment before a test caught it: **207 is a 2xx**,
 * so the existing `if [ "$status" -lt 200 ] || [ "$status" -ge 300 ]` check in
 * the workflows does NOT fail on it. Every caller workflow must therefore also
 * assert the body, and each one now does:
 *
 * ```sh
 * jq -e '.ok == true' /tmp/response.json
 * ```
 *
 * Keeping the status honest and checking the body is the right way round. The
 * alternative was returning 500 for one expired token, which is how alerting
 * becomes noise.
 */
export const JOB_PARTIAL_STATUS = 207;

export type JobOutcome = {
  /** True only when nothing in the batch failed. */
  ok: boolean;
  /** How many items failed. */
  failedCount: number;
  /** How many items were attempted, when the result says. */
  totalCount: number | null;
  /** Up to ten failure reasons, when the result carries them. */
  reasons: string[];
  /** The HTTP status this run should answer with. */
  status: 200 | typeof JOB_PARTIAL_STATUS;
};

/** More than this in one email is noise, and noise is how alerting dies. */
const MAX_REASONS = 10;

function readCount(value: unknown): { count: number; usable: boolean } {
  if (typeof value === "number" && Number.isFinite(value)) {
    return { count: Math.max(0, Math.trunc(value)), usable: true };
  }
  return { count: 0, usable: false };
}

/**
 * Work out whether a job result represents a clean run.
 *
 * Handles both shapes in this codebase: a numeric `failed` (reply sync) and an
 * `errors: string[]` list (queue drain, sequence advance). A result carrying
 * both is counted from both.
 *
 * An `ok` field on the input is **ignored**. That literal is what caused the
 * burn, and trusting it here would reintroduce it.
 *
 * A `failed` field that is present but not a usable number is treated as a
 * FAILURE, not as zero. Guessing zero is exactly how a silent green comes back.
 */
export function jobOutcome(result: unknown): JobOutcome {
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    // Nothing to read. A job that reported no detail is not evidence of
    // failure, and inventing one would make every quiet run an incident.
    return { ok: true, failedCount: 0, totalCount: null, reasons: [], status: 200 };
  }

  const record = result as Record<string, unknown>;

  let failedCount = 0;
  let unreadable = false;

  if ("failed" in record) {
    const read = readCount(record.failed);
    if (read.usable) failedCount += read.count;
    else unreadable = true;
  }

  const reasons: string[] = [];
  if (Array.isArray(record.errors)) {
    failedCount += record.errors.length;
    for (const entry of record.errors.slice(0, MAX_REASONS)) {
      reasons.push(typeof entry === "string" ? entry : JSON.stringify(entry));
    }
  }

  const total = readCount(record.processed ?? record.claimed);

  const ok = !unreadable && failedCount === 0;
  return {
    ok,
    failedCount,
    totalCount: total.usable ? total.count : null,
    reasons,
    status: ok ? 200 : JOB_PARTIAL_STATUS,
  };
}

/**
 * The body an internal job route should answer with.
 *
 * `ok` is DERIVED here, never passed in. Spreading the result after it — as
 * every route currently does — cannot overwrite it, because `ok` is written
 * last.
 */
export function jobResponseBody(result: unknown): Record<string, unknown> {
  const outcome = jobOutcome(result);
  const base =
    typeof result === "object" && result !== null && !Array.isArray(result)
      ? (result as Record<string, unknown>)
      : {};
  return {
    ...base,
    ok: outcome.ok,
    failedCount: outcome.failedCount,
  };
}
