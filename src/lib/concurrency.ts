/**
 * Bounded-concurrency task gate.
 *
 * `createLimiter(limit)` returns a `run(task)` function that runs at most
 * `limit` tasks at once; further tasks queue (cheap in-memory promises, not
 * resources) until a slot frees.
 *
 * Why this exists: fan-out database reads can stampede the pg connection
 * pool. The Reports landing page counts 13 metrics per client across every
 * accessible client, so without a cap it fires `13 × clients` queries in a
 * single burst. Right after login the pool is cold (it drains on idle — see
 * `src/lib/db.ts`), so that burst exhausts it past the connection-acquire
 * timeout and the page throws. Gating the counts keeps in-flight queries
 * comfortably under the pool size regardless of client count. Caller:
 * `src/server/queries/outreach-metrics.ts`.
 *
 * Correctness: a freed slot is handed straight to the next waiter — `active`
 * is never decremented while a waiter exists — so concurrency can never
 * exceed `limit`, even across microtask interleavings (the naive
 * decrement-then-let-the-waiter-increment pattern can transiently
 * over-subscribe). Pure scheduling logic, no I/O — cheap to unit test.
 */
export type TaskGate = <T>(task: () => Promise<T>) => Promise<T>;

export function createLimiter(limit: number): TaskGate {
  const max = Math.max(1, Math.floor(limit));
  let active = 0;
  const waiters: Array<() => void> = [];

  const acquire = (): Promise<void> => {
    if (active < max) {
      active += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      waiters.push(resolve);
    });
  };

  const release = (): void => {
    const next = waiters.shift();
    if (next) {
      // Hand the slot straight over; `active` stays unchanged so the gate
      // can't be over-subscribed between here and the waiter resuming.
      next();
    } else {
      active -= 1;
    }
  };

  return async function run<T>(task: () => Promise<T>): Promise<T> {
    await acquire();
    try {
      return await task();
    } finally {
      release();
    }
  };
}
