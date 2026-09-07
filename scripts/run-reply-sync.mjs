import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

/** Run one finite mailbox snapshot. Never send messages or blindly retry a timed-out request. */
export async function runReplySync(options) {
  const { url, secret, timeoutMs = 180_000, fetchImpl = fetch, onBatch = () => {} } = options;
  if (!url || !secret) throw new Error("Reply sync URL or secret is not configured");
  const request = async (body) => {
    const response = await fetchImpl(url, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(timeoutMs),
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify({ batchProtocol: 1, perMailboxTop: 10, maxMailboxes: 1, ...body }),
    });
    if (response.status !== 200 && response.status !== 207) throw new Error(`Reply sync HTTP ${response.status}`);
    const result = await response.json();
    if (result?.batchProtocol !== 1) throw new Error("Reply sync server does not support the batch protocol");
    return result;
  };

  const plan = await request({ planOnly: true });
  if (!Array.isArray(plan.mailboxIds) || plan.mailboxIds.length > 1000 ||
    plan.mailboxIds.some((id) => typeof id !== "string" || !id.trim() || id.length > 200) ||
    new Set(plan.mailboxIds).size !== plan.mailboxIds.length) {
    throw new Error("Reply sync returned an invalid mailbox plan");
  }
  const summary = { planned: plan.mailboxIds.length, attempted: 0, processed: 0, succeeded: 0, failed: 0, unverified: 0, noLongerEligible: 0, ingested: 0, repliesLinked: 0 };
  for (const mailboxId of plan.mailboxIds) {
    const startedAt = Date.now();
    summary.attempted++;
    try {
      const result = await request({ mailboxId });
      const counts = [result.processed, result.succeeded, result.failed, result.ingested, result.repliesLinked];
      if (counts.some((n) => !Number.isSafeInteger(n) || n < 0) || result.processed > 1 ||
        result.succeeded + result.failed !== result.processed || result.ok !== (result.failed === 0)) {
        throw new Error("Reply sync returned inconsistent batch results");
      }
      summary.processed += result.processed;
      summary.succeeded += result.succeeded;
      summary.failed += result.failed;
      summary.noLongerEligible += 1 - result.processed;
      summary.ingested += result.ingested;
      summary.repliesLinked += result.repliesLinked;
      // Counts only: mailbox identities and provider errors stay out of public CI logs.
      onBatch({ batch: summary.attempted, processed: result.processed, succeeded: result.succeeded, failed: result.failed, elapsedMs: Date.now() - startedAt });
    } catch {
      // The server may have committed partial work before a network timeout.
      // Do not call that success or a proven mailbox failure, and do not retry it here.
      summary.unverified++;
      onBatch({ batch: summary.attempted, unverified: true, elapsedMs: Date.now() - startedAt });
    }
  }
  return { ok: summary.failed === 0 && summary.unverified === 0, ...summary };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await runReplySync({
      url: process.env.REPLY_SYNC_URL, secret: process.env.PROCESS_QUEUE_SECRET,
      onBatch: (batch) => console.log("Reply sync batch", JSON.stringify(batch)),
    });
    console.log("Reply sync summary", JSON.stringify(result));
    if (!result.ok) {
      await appendFile(process.env.RUN_PROBLEMS_PATH || "/tmp/run-problems.txt", `reply sync: ${result.failed} mailbox failures; ${result.unverified} requests unverified; ${result.processed} processed of ${result.planned} planned\n`);
      process.exitCode = 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reply sync runner failed";
    console.error(message);
    await appendFile(process.env.RUN_PROBLEMS_PATH || "/tmp/run-problems.txt", `reply sync could not complete: ${message}\n`);
    process.exitCode = 1;
  }
}
