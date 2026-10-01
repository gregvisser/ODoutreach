// Primary five-minute clock: plan, inbox sync, follow-up advance, AI ticks, queue drain.
// No-ops unless SCHEDULED_OUTREACH_TIMER=on. GitHub Actions remains the backup.
// OUTBOUND_QUEUE_RECOVERY_TIMER must stay off — that job also drains the queue.
const endpoint = 'https://opensdoors.bidlow.co.uk/api/internal/scheduled-outreach/v1';

function publicBatch(batch) {
  const safe = {
    event: 'scheduled-outreach-batch',
    phase: typeof batch?.phase === 'string' ? batch.phase : 'unknown',
    ok: batch?.ok === true,
    skipped: batch?.skipped === true,
    unverified: batch?.unverified === true,
  };
  if (Array.isArray(batch?.errors)) safe.notes = batch.errors.length;
  return safe;
}

async function runScheduledOutreachTimer({ enabled, secret, url = endpoint, runner, queueRecovery = '' }) {
  if (enabled !== 'on') return { ok: true, skipped: true, reason: 'timer-disabled' };
  if (queueRecovery === 'on') throw new Error('Queue recovery timer is also on');
  if (!secret?.trim()) throw new Error('Scheduled outreach timer is not configured');
  const { pathToFileURL } = await import('node:url');
  const { resolve } = await import('node:path');
  const run = runner || (await import(pathToFileURL(resolve(__dirname, '../../../../scripts/run-scheduled-outreach.mjs')).href)).runScheduledOutreach;
  const result = await run({
    url,
    secret: secret.trim(),
    onBatch: (batch) => console.log(JSON.stringify(publicBatch(batch))),
  });
  const summary = {
    ok: result?.ok === true,
    plannedClients: Number.isSafeInteger(result?.plannedClients) ? result.plannedClients : 0,
    plannedMailboxes: Number.isSafeInteger(result?.plannedMailboxes) ? result.plannedMailboxes : 0,
    attempted: Number.isSafeInteger(result?.attempted) ? result.attempted : 0,
    failed: Number.isSafeInteger(result?.failed) ? result.failed : 0,
    unverified: Number.isSafeInteger(result?.unverified) ? result.unverified : 0,
    skipped: Number.isSafeInteger(result?.skipped) ? result.skipped : 0,
  };
  if (!summary.ok) throw new Error('Scheduled outreach did not complete cleanly');
  return {
    ok: true,
    timerSkipped: false,
    plannedClients: summary.plannedClients,
    plannedMailboxes: summary.plannedMailboxes,
    attempted: summary.attempted,
    failed: summary.failed,
    unverified: summary.unverified,
    skippedSteps: summary.skipped,
  };
}

module.exports = { runScheduledOutreachTimer, publicBatch };

if (require.main === module) {
  runScheduledOutreachTimer({
    enabled: process.env.SCHEDULED_OUTREACH_TIMER,
    secret: process.env.PROCESS_QUEUE_SECRET,
    queueRecovery: process.env.OUTBOUND_QUEUE_RECOVERY_TIMER,
  })
    .then(result => console.log(JSON.stringify({ event: 'scheduled-outreach-complete', at: new Date().toISOString(), ...result })))
    .catch(() => {
      console.error(JSON.stringify({ event: 'scheduled-outreach-failed', at: new Date().toISOString() }));
      process.exitCode = 1;
    });
}
