// Read-only Azure timer proof. Deliberately cannot run sync, advance, or queue.
const endpoint = 'https://opensdoors.bidlow.co.uk/api/internal/scheduled-outreach/v1';

async function probeSchedule({ secret, url = endpoint, timeoutMs = 30_000 }) {
  if (!secret?.trim()) throw new Error('Scheduler probe is not configured');
  const response = await fetch(url, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
    headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
    body: JSON.stringify({ schedulerProtocol: 1, phase: 'plan' }),
  });
  if (response.status !== 200) throw new Error(`Scheduler probe HTTP ${response.status}`);
  const plan = await response.json();
  const valid = ids => Array.isArray(ids) && ids.length <= 1000 &&
    ids.every(id => typeof id === 'string' && id.trim() && id.length <= 200) && new Set(ids).size === ids.length;
  if (plan.schedulerProtocol !== 1 || plan.ok !== true || !valid(plan.clientIds) || !valid(plan.mailboxIds)) {
    throw new Error('Invalid scheduler probe response');
  }
  return { ok: true, mode: 'plan-only', clients: plan.clientIds.length, mailboxes: plan.mailboxIds.length };
}

module.exports = { probeSchedule };
if (require.main === module) {
  console.log(JSON.stringify({ event: 'scheduler-probe-start', at: new Date().toISOString() }));
  probeSchedule({ secret: process.env.PROCESS_QUEUE_SECRET }).then(result => {
    console.log(JSON.stringify({ event: 'scheduler-probe-complete', at: new Date().toISOString(), ...result }));
  }).catch(() => {
    // Keep credentials, response bodies and client identifiers out of platform logs.
    console.error(JSON.stringify({ event: 'scheduler-probe-failed', at: new Date().toISOString() }));
    process.exitCode = 1;
  });
}
