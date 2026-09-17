async function runReplyTimer({ enabled, secret, runner }) {
  if (enabled !== 'on') return { ok: true, skipped: true };
  if (!secret?.trim()) throw new Error('Reply timer is not configured');
  const { pathToFileURL } = await import('node:url');
  const { resolve } = await import('node:path');
  const sync = runner || (await import(pathToFileURL(resolve(__dirname, '../../../../scripts/run-reply-sync.mjs')).href)).runReplySync;
  const options = {
    url: 'https://opensdoors.bidlow.co.uk/api/internal/replies/sync',
    secret: secret.trim(),
  };
  if (!runner) {
    options.onBatch = (batch) => console.log(JSON.stringify({
      event: 'reply-timer-batch',
      batch: Number.isSafeInteger(batch?.batch) ? batch.batch : 0,
      elapsedMs: Number.isSafeInteger(batch?.elapsedMs) ? batch.elapsedMs : 0,
      processed: Number.isSafeInteger(batch?.processed) ? batch.processed : 0,
      succeeded: Number.isSafeInteger(batch?.succeeded) ? batch.succeeded : 0,
      failed: Number.isSafeInteger(batch?.failed) ? batch.failed : 0,
      unverified: batch?.unverified === true ? 1 : 0,
    }));
  }
  const result = await sync(options);
  if (!result.ok) {
    console.error(JSON.stringify({
      event: 'reply-timer-partial',
      planned: Number.isSafeInteger(result?.planned) ? result.planned : 0,
      attempted: Number.isSafeInteger(result?.attempted) ? result.attempted : 0,
      processed: Number.isSafeInteger(result?.processed) ? result.processed : 0,
      succeeded: Number.isSafeInteger(result?.succeeded) ? result.succeeded : 0,
      failed: Number.isSafeInteger(result?.failed) ? result.failed : 0,
      unverified: Number.isSafeInteger(result?.unverified) ? result.unverified : 0,
    }));
    throw new Error('Reply timer did not complete every mailbox');
  }
  return { ok: true, processed: result.processed, ingested: result.ingested, repliesLinked: result.repliesLinked };
}
module.exports = { runReplyTimer };
if (require.main === module) {
  runReplyTimer({ enabled: process.env.REPLY_SYNC_TIMER, secret: process.env.PROCESS_QUEUE_SECRET })
    .then(result => console.log(JSON.stringify({ event: 'reply-timer-complete', at: new Date().toISOString(), ...result })))
    .catch(() => { console.error(JSON.stringify({ event: 'reply-timer-failed', at: new Date().toISOString() })); process.exitCode = 1; });
}
