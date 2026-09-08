import { pathToFileURL } from 'node:url';

export async function runCompanyNameSheets({ url, secret, fetchImpl = fetch, timeoutMs = 180_000, budgetMs = 900_000 }) {
  if (!url || !secret || new URL(url).pathname !== '/api/internal/company-name-sheets/v1') throw Error('Use the configured versioned company-sheet endpoint');
  async function request(body) {
    const response = await fetchImpl(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs), headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' }, body: JSON.stringify({ protocol: 1, ...body }) });
    if (response.status !== 200 && response.status !== 207) throw Error(`Company sheet HTTP ${response.status}`);
    const result = await response.json();
    if (result?.protocol !== 1 || typeof result.ok !== 'boolean') throw Error('Unsupported company-sheet response');
    return result;
  }
  const plan = await request({ planOnly: true });
  if (!plan.ok || !Array.isArray(plan.sourceIds) || plan.sourceIds.length > 1000 || plan.sourceIds.some(id => typeof id !== 'string' || !id.trim() || id.length > 200) || new Set(plan.sourceIds).size !== plan.sourceIds.length) throw Error('Invalid company-sheet plan');
  const result = { ok: true, planned: plan.sourceIds.length, succeeded: 0, failed: 0, unverified: 0 };
  const deadline = Date.now() + budgetMs;
  for (const [index, sourceId] of plan.sourceIds.entries()) {
    if (Date.now() >= deadline) { result.unverified += plan.sourceIds.length - index; break; }
    try { const batch = await request({ sourceId }); if (batch.ok) result.succeeded++; else result.failed++; }
    catch { result.unverified++; } // An uncertain response is never blindly retried.
  }
  result.ok = result.failed === 0 && result.unverified === 0;
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await runCompanyNameSheets({ url: process.env.COMPANY_SHEETS_SYNC_URL, secret: process.env.PROCESS_QUEUE_SECRET });
    console.log('Company-name sheet sync', JSON.stringify(result));
    if (!result.ok) process.exitCode = 1;
  } catch { console.error('Company-name sheet sync failed before a verified result.'); process.exitCode = 1; }
}
