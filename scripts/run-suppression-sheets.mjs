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
  const summary = { planned: plan.length, attempted: 0, succeeded: 0, failed: 0, unverified: 0, held: 0, removed: 0 };
  for (const sourceId of plan) {
    if (Date.now() - startedAt >= budgetMs) { summary.unverified += plan.length - summary.attempted; break; }
    summary.attempted++;
    try {
      const response = await fetchImpl(syncUrl, {
        method: "POST", headers, redirect: "error", signal: AbortSignal.timeout(Math.min(timeoutMs, Math.max(1, budgetMs - (Date.now() - startedAt)))),
        body: JSON.stringify({ sourceId }),
      });
      if (response.status !== 200) throw new Error("DNC request did not return a verified outcome");
      const result = await response.json();
      const outcome = result?.outcomes?.[0];
      const removed = typeof outcome?.removed === "number" ? outcome.removed : 0;
      const mirrored = outcome?.ok === true;
      const held = outcome?.ok === false && outcome?.held === true;
      if (result.sources !== 1 || !Array.isArray(result.outcomes) || result.outcomes.length !== 1 || outcome?.sourceId !== sourceId ||
          result.ok !== true || result.dryRun === true || result.failed !== 0 ||
          (mirrored && result.succeeded !== 1) || (held && result.held !== 1) ||
          (!mirrored && !held)) throw new Error("Inconsistent DNC source outcome");
      if (mirrored) summary.succeeded++;
      else summary.held++;
      summary.removed += removed;
      // Client and counts only. Sheet rows and error prose stay on the source record.
      onBatch({
        batch: summary.attempted,
        client: typeof outcome.client === "string" ? outcome.client : undefined,
        kind: typeof outcome.kind === "string" ? outcome.kind : undefined,
        ok: mirrored,
        held,
        removed,
      });
    } catch {
      summary.unverified++;
      onBatch({ batch: summary.attempted, unverified: true });
    }
  }
  return { ok: summary.failed === 0 && summary.unverified === 0, ...summary };
}

/** A sheet that was kept or mirrored is a report. Only an unverified sync fails the run. */
export function suppressionRunReport(result) {
  const warning = result.held > 0
    ? `${result.held} do-not-contact sheets were not applied; the existing list was kept`
    : null;
  const problem = result.ok
    ? null
    : `do-not-contact sheet sync: ${result.unverified} unverified of ${result.planned} planned sheets`;
  return { warning, problem };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await runSuppressionSheets({ url: process.env.SUPPRESSION_SYNC_URL, secret: process.env.PROCESS_QUEUE_SECRET,
      onBatch: batch => console.log("DNC sheet batch", JSON.stringify(batch)) });
    console.log("DNC sheet summary", JSON.stringify(result));
    const report = suppressionRunReport(result);
    if (report.warning) console.log(`::warning title=DNC sheet held::${report.warning}`);
    if (report.problem) {
      await appendFile(process.env.RUN_PROBLEMS_PATH || "/tmp/run-problems.txt", `${report.problem}\n`);
      process.exitCode = 1;
    }
  } catch {
    console.error("DNC inventory could not be verified; no sheet sync started");
    await appendFile(process.env.RUN_PROBLEMS_PATH || "/tmp/run-problems.txt", "do-not-contact sheet inventory unavailable or invalid; refresh unverified\n");
    process.exitCode = 1;
  }
}
