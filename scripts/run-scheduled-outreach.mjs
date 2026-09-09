import { pathToFileURL } from 'node:url';

/** Finite, versioned run. Never fall back to an older unscoped send endpoint. */
export async function runScheduledOutreach({ url, secret, timeoutMs = 180_000, budgetMs = 20 * 60_000, now = Date.now, fetchImpl = fetch, onBatch = () => {} }) {
  if (!url || !secret) throw Error('Scheduled outreach URL or secret is not configured');
  if (!Number.isSafeInteger(budgetMs) || budgetMs <= 0 || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw Error('Invalid scheduled outreach time budget');
  const deadline = now() + budgetMs;
  const target = new URL(url);
  if (!['http:', 'https:'].includes(target.protocol) || target.pathname !== '/api/internal/scheduled-outreach/v1') throw Error('Use the versioned scheduled outreach endpoint');
  const request = async body => {
    const remainingMs = deadline - now();
    if (remainingMs <= 0) throw Error('Scheduled outreach time budget exhausted');
    const response = await fetchImpl(url, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(Math.min(timeoutMs, remainingMs)),
      headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
      body: JSON.stringify({ schedulerProtocol: 1, ...body }),
    });
    if (response.status !== 200 && response.status !== 207) throw Error(`Scheduled outreach HTTP ${response.status}`);
    const result = await response.json();
    if (result?.schedulerProtocol !== 1 || typeof result.ok !== 'boolean') throw Error('Unsupported scheduled outreach response');
    return result;
  };
  const plan = await request({ phase: 'plan' });
  const validIds = ids => Array.isArray(ids) && ids.length <= 1000 && ids.every(id => typeof id === 'string' && id.trim() && id.length <= 200) && new Set(ids).size === ids.length;
  if (!plan.ok || !validIds(plan.clientIds) || !validIds(plan.mailboxIds)) throw Error('Invalid scheduled outreach plan');
  const summary = { plannedClients: plan.clientIds.length, plannedMailboxes: plan.mailboxIds.length, attempted: 0, failed: 0, unverified: 0, skipped: 0 };
  const batch = async body => {
    if (now() >= deadline) {
      // No HTTP request was made. Never report an unattempted phase as success.
      summary.unverified++;
      onBatch({ phase: body.phase, unverified: true, unattempted: true });
      return;
    }
    summary.attempted++;
    try {
      const result = await request(body);
      if (!result.ok) summary.failed++;
      if (result.skipped === true) summary.skipped++;
      onBatch({ phase: body.phase, ok: result.ok, skipped: result.skipped === true });
    } catch {
      // A timeout may follow committed work. Record it without blind retries.
      summary.unverified++;
      onBatch({ phase: body.phase, unverified: true });
    }
  };
  for (const mailboxId of plan.mailboxIds) await batch({ phase: 'sync', mailboxId });
  // Preserve the existing non-fatal pre-sync policy, but never a false green.
  for (const clientId of plan.clientIds) await batch({ phase: 'advance', clientId });
  if (plan.clientIds.length) await batch({ phase: 'queue' });
  return { ok: summary.failed === 0 && summary.unverified === 0, ...summary };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await runScheduledOutreach({ url: process.env.SCHEDULED_OUTREACH_URL, secret: process.env.PROCESS_QUEUE_SECRET, onBatch: batch => console.log('Scheduled batch', JSON.stringify(batch)) });
    console.log('Scheduled outreach summary', JSON.stringify(result));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Scheduled outreach failed');
    process.exitCode = 1;
  }
}
