import { describe, expect, it } from "vitest";

import { jobOutcome, JOB_PARTIAL_STATUS } from "./job-outcome";

/**
 * THE RECORDED BURN, IN ONE SENTENCE: a scheduled job went green while 8 of 35
 * mailboxes were failing reply sync, because the errors sat inside an HTTP 200
 * body.
 *
 * `src/app/api/internal/replies/sync/route.ts` ends
 * `return NextResponse.json({ ok: true, ...result })` — `ok: true` is a literal,
 * written before anyone looks at `result`. All four internal job routes do the
 * same. The GitHub workflow then checks only the HTTP status, gets 200, and
 * ticks green.
 *
 * The data was never missing. `ReplySyncBatchResult` carries `failed`, and the
 * queue processor carries `errors: string[]`. Nothing read them.
 *
 * This decides the outcome from the result rather than asserting it. If any item
 * in a batch failed, the run is not a success.
 */

describe("a run with no failures is a success", () => {
  it("accepts a clean reply-sync batch", () => {
    const outcome = jobOutcome({ processed: 35, succeeded: 35, failed: 0, ingested: 12 });
    expect(outcome.ok).toBe(true);
    expect(outcome.failedCount).toBe(0);
    expect(outcome.status).toBe(200);
  });

  it("accepts a clean queue drain", () => {
    const outcome = jobOutcome({ claimed: 8, completed: 8, errors: [] });
    expect(outcome.ok).toBe(true);
    expect(outcome.status).toBe(200);
  });

  it("accepts a run that did nothing at all", () => {
    // Nothing to do is not a failure. A quiet Sunday is not an incident.
    expect(jobOutcome({ processed: 0, succeeded: 0, failed: 0 }).ok).toBe(true);
    expect(jobOutcome({ claimed: 0, completed: 0, errors: [] }).ok).toBe(true);
    expect(jobOutcome({}).ok).toBe(true);
  });
});

describe("a run with ANY failed item is not a success", () => {
  it("catches the exact burn — 8 of 35 mailboxes failed", () => {
    const outcome = jobOutcome({ processed: 35, succeeded: 27, failed: 8, ingested: 4 });
    expect(outcome.ok).toBe(false);
    expect(outcome.failedCount).toBe(8);
    expect(outcome.totalCount).toBe(35);
    // Not 200 — the run is not a success.
    expect(outcome.status).toBe(JOB_PARTIAL_STATUS);
    expect(outcome.status).not.toBe(200);
    // 207 is a 2xx, so a status-only check does NOT catch it. That is the whole
    // reason every caller workflow must also assert `.ok == true` on the body.
    // This assertion exists to keep that fact visible rather than surprising.
    expect(outcome.status).toBeLessThan(300);
  });

  it("catches a single failure, not just a large one", () => {
    const outcome = jobOutcome({ processed: 35, succeeded: 34, failed: 1 });
    expect(outcome.ok).toBe(false);
    expect(outcome.failedCount).toBe(1);
  });

  it("catches errors reported as a list rather than a count", () => {
    const outcome = jobOutcome({
      claimed: 8,
      completed: 6,
      errors: ["row a: token expired", "row b: 550 rejected"],
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.failedCount).toBe(2);
    // The reasons must survive — an alert that cannot say why is a pager.
    expect(outcome.reasons).toEqual(["row a: token expired", "row b: 550 rejected"]);
  });

  it("does not count the same failure twice when a result carries both shapes", () => {
    /**
     * A near-miss, caught on 2026-08-25 while making reply sync say WHICH
     * mailboxes failed rather than just how many.
     *
     * Adding `errors` to a result that already had a numeric `failed` made
     * this sum the two: 8 real failures would have alerted as "16 of 35".
     * An alert that inflates the number is not a smaller problem than one
     * that hides it — both mean the number cannot be trusted, and the number
     * is the entire point.
     *
     * So: a numeric `failed` is AUTHORITATIVE and `errors` are its reasons.
     * `errors` is only itself a count when nothing else reports one, which is
     * the queue-drain shape.
     */
    const bothShapes = jobOutcome({
      processed: 35,
      failed: 8,
      errors: ["jo@x.co.uk: Reconnect required", "sam@y.com: Graph 401"],
    });
    expect(bothShapes.failedCount).toBe(8);
    expect(bothShapes.reasons).toHaveLength(2);

    // The queue-drain shape has no `failed`, so the list IS the count.
    expect(jobOutcome({ claimed: 10, errors: ["a", "b"] }).failedCount).toBe(2);
  });

  it("still fails a run whose only signal is a reason list", () => {
    // `failed: 0` with reasons present would be a contradiction; trust the
    // count, but never report the run as clean while reasons exist.
    const outcome = jobOutcome({ processed: 5, failed: 0, errors: ["something broke"] });
    expect(outcome.ok).toBe(false);
  });
});

describe("it cannot be fooled", () => {
  it("ignores an ok:true that the caller asserted", () => {
    // The literal that caused the burn. It must carry no weight.
    const outcome = jobOutcome({ ok: true, processed: 35, succeeded: 27, failed: 8 });
    expect(outcome.ok).toBe(false);
  });

  it("treats a non-numeric failed count as a failure rather than a zero", () => {
    // Guessing zero here is how a silent green comes back.
    expect(jobOutcome({ failed: "8" }).ok).toBe(false);
    expect(jobOutcome({ failed: null }).ok).toBe(false);
    expect(jobOutcome({ failed: Number.NaN }).ok).toBe(false);
  });

  it("survives junk without throwing", () => {
    expect(jobOutcome(null).ok).toBe(true);
    expect(jobOutcome(undefined).ok).toBe(true);
    expect(jobOutcome("nonsense").ok).toBe(true);
    expect(jobOutcome([]).ok).toBe(true);
  });

  it("caps how many reasons it carries, so one bad run cannot flood an email", () => {
    const many = Array.from({ length: 200 }, (_, i) => `failure ${i}`);
    const outcome = jobOutcome({ errors: many });
    expect(outcome.failedCount).toBe(200);
    expect(outcome.reasons.length).toBeLessThanOrEqual(10);
  });
});
