// Recover existing approved queue rows only. Never enrol contacts or advance campaigns.
const endpoint = 'https://opensdoors.bidlow.co.uk/api/internal/scheduled-outreach/v1';

async function runQueueRecovery({ enabled, secret, url = endpoint, timeoutMs = 180_000 }) {
  if (enabled !== 'on') return { ok: true, skipped: true };
  if (!secret?.trim()) throw new Error('Queue recovery is not configured');
  const response = await fetch(url, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
    headers: { authorization: `Bearer ${secret.trim()}`, 'content-type': 'application/json' },
    body: JSON.stringify({ schedulerProtocol: 1, phase: 'queue' }),
  });
  if (response.status !== 200) throw new Error(`Queue recovery HTTP ${response.status}`);
  const result = await response.json();
  if (result?.schedulerProtocol !== 1 || result.ok !== true) throw new Error('Invalid queue recovery response');
  return { ok: true, skipped: result.skipped === true };
}
module.exports = { runQueueRecovery };
if (require.main === module) {
  runQueueRecovery({ enabled: process.env.OUTBOUND_QUEUE_RECOVERY_TIMER, secret: process.env.PROCESS_QUEUE_SECRET })
    .then(result => console.log(JSON.stringify({ event: 'queue-recovery-complete', at: new Date().toISOString(), ...result })))
    .catch(() => { console.error(JSON.stringify({ event: 'queue-recovery-failed', at: new Date().toISOString() })); process.exitCode = 1; });
}
