async function runReplyTimer({ enabled, secret, runner }) {
  if (enabled !== 'on') return { ok: true, skipped: true };
  if (!secret?.trim()) throw new Error('Reply timer is not configured');
  const { pathToFileURL } = await import('node:url');
  const { resolve } = await import('node:path');
  const sync = runner || (await import(pathToFileURL(resolve(__dirname, '../../../../scripts/run-reply-sync.mjs')).href)).runReplySync;
  const result = await sync({
    url: 'https://opensdoors.bidlow.co.uk/api/internal/replies/sync',
    secret: secret.trim(),
  });
  if (!result.ok) throw new Error('Reply timer did not complete every mailbox');
  return { ok: true, processed: result.processed, ingested: result.ingested, repliesLinked: result.repliesLinked };
}
module.exports = { runReplyTimer };
if (require.main === module) {
  runReplyTimer({ enabled: process.env.REPLY_SYNC_TIMER, secret: process.env.PROCESS_QUEUE_SECRET })
    .then(result => console.log(JSON.stringify({ event: 'reply-timer-complete', at: new Date().toISOString(), ...result })))
    .catch(() => { console.error(JSON.stringify({ event: 'reply-timer-failed', at: new Date().toISOString() })); process.exitCode = 1; });
}
