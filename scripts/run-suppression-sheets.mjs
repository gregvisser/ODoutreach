import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

/** A finite inventory, one named sheet per request, no retry after an uncertain write. */
export async function runSuppressionSheets({ url, secret, fetchImpl = fetch, timeoutMs = 180_000, budgetMs = 1_200_000, onBatch = () => {} }) {
  if (!url || !secret) throw new Error("DNC sync URL or secret is not configured");
  const syncUrl = new URL(url);
  if (syncUrl.pathname !== "/api/internal/suppression/sync-all" || syncUrl.search || syncUrl.hash || syncUrl.username || syncUrl.password) throw new Error("Unexpected DNC sync endpoint");
  const startedAt = Date.now();
  const headers = { authorization: `Bearer ${secret}`, "content-type": "application/json" };
  const inventoryResponse = await fetchImpl(new URL("/api/internal/suppression/sources", syncUrl), {
    headers, redirect: "error", signal: AbortSignal.timeout(timeoutMs),
  });
  if (inventoryResponse.status !== 200) throw new Error(`DNC inventory HTTP ${inventoryResponse.status}`);
  const inventory = await inventoryResponse.json();
  if (!Array.isArray(inventory?.entries) || inventory.entries.length > 1000 || inventory.sources !== inventory.entries.length ||
      inventory.entries.some(entry => !entry || typeof entry.sourceId !== "string" || !entry.sourceId.trim() || entry.sourceId.length > 200 || typeof entry.spreadsheetLinked !== "boolean") ||
      new Set(inventory.entries.map(entry => entry.sourceId)).size !== inventory.entries.length) throw new Error("Invalid DNC inventory; nothing synced");
  const plan = inventory.entries.filter(entry => entry.spreadsheetLinked).map(entry => entry.sourceId);
  const summary = { planned: plan.length, attempted: 0, succeeded: 0, failed: 0, unverified: 0, refusedShrink: 0 };
  for (const sourceId of plan) {
    if (Date.now() - startedAt >= budgetMs) { summary.unverified += plan.length - summary.attempted; break; }
    summary.attempted++;
    try {
      const response = await fetchImpl(syncUrl, {
        method: "POST", headers, redirect: "error", signal: AbortSignal.timeout(Math.min(timeoutMs, Math.max(1, budgetMs - (Date.now() - startedAt)))),
        body: JSON.stringify({ sourceId }),
      });
      if (response.status !== 200 && response.status !== 207) throw new Error("DNC request did not return a verified outcome");
      const result = await response.json();
      const outcome = result?.outcomes?.[0];
      if (result.sources !== 1 || !Array.isArray(result.outcomes) || result.outcomes.length !== 1 || outcome?.sourceId !== sourceId ||
          typeof outcome.ok !== "boolean" || result.ok !== outcome.ok || result.dryRun === true ||
          result.succeeded !== (outcome.ok ? 1 : 0) || result.failed !== (outcome.ok ? 0 : 1) ||
          response.status !== (outcome.ok ? 200 : 207)) throw new Error("Inconsistent DNC source outcome");
      if (outcome.ok) summary.succeeded++;
      else { summary.failed++; if (outcome.refusedShrink === true) summary.refusedShrink++; }
      // Public workflow output contains counts only, never private source details.
      onBatch({ batch: summary.attempted, ok: outcome.ok, refusedShrink: outcome.refusedShrink === true });
    } catch {
      summary.unverified++;
      onBatch({ batch: summary.attempted, unverified: true });
    }
  }
  return { ok: summary.failed === 0 && summary.unverified === 0, ...summary };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await runSuppressionSheets({ url: process.env.SUPPRESSION_SYNC_URL, secret: process.env.PROCESS_QUEUE_SECRET,
      onBatch: batch => console.log("DNC sheet batch", JSON.stringify(batch)) });
    console.log("DNC sheet summary", JSON.stringify(result));
    if (!result.ok) {
      await appendFile(process.env.RUN_PROBLEMS_PATH || "/tmp/run-problems.txt", `do-not-contact sheet sync: ${result.failed} failed (${result.refusedShrink} shrink refusals); ${result.unverified} unverified of ${result.planned} planned sheets\n`);
      process.exitCode = 1;
    }
  } catch {
    console.error("DNC inventory could not be verified; no sheet sync started");
    await appendFile(process.env.RUN_PROBLEMS_PATH || "/tmp/run-problems.txt", "do-not-contact sheet inventory unavailable or invalid; refresh unverified\n");
    process.exitCode = 1;
  }
}
