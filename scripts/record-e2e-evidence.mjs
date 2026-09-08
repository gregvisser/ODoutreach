import fs from "node:fs";

let report;
try { report = JSON.parse(fs.readFileSync("playwright-results.json", "utf8")); } catch {}
const stats = report?.stats;
const valid = stats && [stats.expected, stats.unexpected, stats.flaky, stats.skipped]
  .every(value => Number.isSafeInteger(value) && value >= 0)
  && Array.isArray(report.errors);
const suite = {
  name: "playwright (e2e)", command: "npm run test:e2e",
  passed: Boolean(valid && stats.expected > 0 && stats.unexpected === 0 && stats.flaky === 0 && report.errors.length === 0),
  count: valid ? stats.expected + stats.unexpected + stats.flaky : 0,
  failed: valid ? stats.unexpected : null,
  flaky: valid ? stats.flaky : null,
  skipped: valid ? stats.skipped : null,
  errors: valid ? report.errors.length : null,
  ...(!valid ? { note: "Missing or invalid browser results cannot prove a clean run." } : {}),
};
fs.writeFileSync("evidence-e2e.json", JSON.stringify({
  commit: process.env.GITHUB_SHA, run: process.env.GITHUB_RUN_ID,
  recorded_by: "github-actions", suites: [suite],
}, null, 2));
console.log(JSON.stringify(suite));
if (!suite.passed) {
  const message = "Browser release gate failed: missing, empty, failed, flaky or interrupted results. Inspect the retained browser artifacts.";
  console.error(`::error title=Browser release blocked::${message}`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Browser release blocked\n\n${message}\n`);
  process.exitCode = 1;
}
