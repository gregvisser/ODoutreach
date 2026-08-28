/**
 * Pacing and retry for Google Sheets READ requests.
 *
 * Google allows sixty read requests per minute per user, and the service
 * account is one user for every client we have.
 *
 * Resolving a sheet's real tab (rather than assuming "Sheet1") fixed two
 * broken blocklists and cost a second API call per sheet. Thirty-four
 * configured sources went from thirty-four requests to sixty-eight, which is
 * over the limit, and the live dry run on 2026-08-28 duly reported
 * "Quota exceeded" for five of them — including Pareto FM, the client the fix
 * was written for. The cron run seven hours earlier, before the fix, shows no
 * quota errors at all. We caused this by doubling our own request rate.
 *
 * A quota ceiling is not something to code around, so this paces reads under
 * it and retries the ones that still bounce. It sits in front of every Sheets
 * read rather than only the batch: the batch is where the burst is, but a
 * ceiling shared by every caller has to be respected by every caller.
 */

/** Google's documented limit is 60/minute/user; 1.1s between reads is ~54. */
const DEFAULT_MIN_INTERVAL_MS = 1_100;

/**
 * Waits between retries of a read that was refused for quota.
 *
 * The limit is per MINUTE, so the useful backoff is tens of seconds rather
 * than the hundreds of milliseconds a connection blip would want. Two retries,
 * not more: a sheet that is still refused after twenty-five seconds needs to
 * be reported as a failure, not to hold the whole run open until the request
 * times out and thirty-four blocklists learn nothing.
 */
const DEFAULT_BACKOFF_MS: readonly number[] = [5_000, 20_000];

export type SheetsReadTimer = {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
};

export type SheetsReadLimiterOptions = {
  minIntervalMs?: number;
  backoffMs?: readonly number[];
};

export type SheetsRead = <T>(read: () => Promise<T>) => Promise<T>;

function messageOf(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const m = (error as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return "";
}

function statusOf(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  for (const key of ["code", "status"] as const) {
    const v = (error as Record<string, unknown>)[key];
    if (typeof v === "number") return v;
  }
  return undefined;
}

/**
 * Is this the error that means "come back in a moment", as opposed to the one
 * that means "this will never work"?
 *
 * The distinction is the point. A bad range — the original bug — must NOT be
 * retried: it cannot succeed, and dressing a permanent breakage up as a
 * transient one is how a blocklist stays broken for weeks without anyone
 * seeing a hard failure.
 */
export function isSheetsQuotaError(error: unknown): boolean {
  if (statusOf(error) === 429) return true;
  const message = messageOf(error).toLowerCase();
  return (
    message.includes("quota exceeded") ||
    message.includes("rate limit exceeded") ||
    message.includes("user rate limit")
  );
}

/**
 * A read gate with an injectable clock, so the pacing can be tested without
 * a test suite that actually waits twenty-five seconds.
 */
export function createSheetsReadLimiter(
  timer: SheetsReadTimer,
  options: SheetsReadLimiterOptions = {},
): SheetsRead {
  const minIntervalMs = options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
  const backoffMs = options.backoffMs ?? DEFAULT_BACKOFF_MS;

  // Reads are queued rather than merely spaced. Spacing alone would do nothing
  // about callers that fire concurrently — they would each check the same last
  // timestamp, all decide they need not wait, and burst.
  let queue: Promise<unknown> = Promise.resolve();
  let lastStartedAt: number | null = null;

  async function paced<T>(read: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      if (lastStartedAt !== null) {
        const wait = minIntervalMs - (timer.now() - lastStartedAt);
        if (wait > 0) await timer.sleep(wait);
      }
      lastStartedAt = timer.now();
      try {
        return await read();
      } catch (error) {
        // A refused read still spent a request, so `lastStartedAt` stands.
        if (!isSheetsQuotaError(error) || attempt >= backoffMs.length) throw error;
        await timer.sleep(backoffMs[attempt]);
      }
    }
  }

  return <T>(read: () => Promise<T>): Promise<T> => {
    const result = queue.then(() => paced(read));
    // The queue must survive a failed read; chaining the raw promise would
    // reject it and every read behind it with someone else's error.
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
}

const realTimer: SheetsReadTimer = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * The shared gate every Sheets read goes through.
 *
 * Module-level, because the quota is per service account and not per request:
 * a limiter created per sync would let two overlapping runs each believe they
 * had the whole allowance.
 *
 * Under vitest the waits are zero but the RETRIES REMAIN. The suites here
 * drive the Sheets client through mocks hundreds of times and would otherwise
 * spend minutes asleep — but switching retrying off as well would leave
 * nothing able to notice this gate being unwired from the sync, which is
 * exactly how something gets built, reported working, and never fires. The
 * real intervals are asserted in this module's own tests against an injected
 * clock.
 */
export const limitSheetsRead: SheetsRead = createSheetsReadLimiter(
  realTimer,
  process.env.VITEST ? { minIntervalMs: 0, backoffMs: [0, 0] } : {},
);
