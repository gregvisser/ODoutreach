const endpoint = 'https://opensdoors.bidlow.co.uk/api/internal/campaign-scheduler/v1';

async function runCampaignTimer({ enabled, secret, url = endpoint, timeoutMs = 180_000 }) {
  if (enabled !== 'on') return { ok: true, skipped: true, reason: 'timer-disabled' };
  if (!secret?.trim()) throw new Error('Campaign timer is not configured');
  const response = await fetch(url, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
    headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
    body: JSON.stringify({ campaignSchedulerProtocol: 1 }),
  });
  if (response.status !== 200) throw new Error(`Campaign timer HTTP ${response.status}`);
  const result = await response.json();
  if (result?.campaignSchedulerProtocol !== 1 || result.ok !== true) throw new Error('Invalid campaign timer response');
  // Provider/customer identifiers and errors must not appear in platform logs.
  return { ok: true, skipped: result.skipped === true, queued: Number.isSafeInteger(result.followUpsQueued) ? result.followUpsQueued : 0 };
}
module.exports = { runCampaignTimer };
if (require.main === module) {
  runCampaignTimer({ enabled: process.env.CAMPAIGN_SCHEDULER_TIMER, secret: process.env.PROCESS_QUEUE_SECRET })
    .then(result => console.log(JSON.stringify({ event: 'campaign-timer-complete', at: new Date().toISOString(), ...result })))
    .catch(() => { console.error(JSON.stringify({ event: 'campaign-timer-failed', at: new Date().toISOString() })); process.exitCode = 1; });
}
