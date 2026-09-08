import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const script = path.resolve("scripts/record-e2e-evidence.mjs");
const clean = { stats: { expected: 128, unexpected: 0, flaky: 0, skipped: 1 }, errors: [] };
function run(report: unknown) {
  const cwd = mkdtempSync(path.join(tmpdir(), "odoutreach-browser-gate-"));
  try {
    if (report !== undefined) writeFileSync(path.join(cwd, "playwright-results.json"), typeof report === "string" ? report : JSON.stringify(report));
    const result = spawnSync(process.execPath, [script], { cwd, encoding: "utf8", env: { ...process.env, GITHUB_SHA: "test-commit", GITHUB_RUN_ID: "test-run", GITHUB_STEP_SUMMARY: path.join(cwd, "summary.md") } });
    return { status: result.status, evidence: JSON.parse(readFileSync(path.join(cwd, "evidence-e2e.json"), "utf8")) };
  } finally { rmSync(cwd, { recursive: true, force: true }); }
}
describe("browser release evidence process", () => {
  it("accepts a clean non-empty suite and preserves exact run identity", () => {
    const result = run(clean);
    expect(result.status).toBe(0);
    expect(result.evidence).toMatchObject({ commit: "test-commit", run: "test-run", suites: [{ passed: true, count: 128, flaky: 0, failed: 0, skipped: 1 }] });
  });
  it.each([
    ["retry-only success", { ...clean, stats: { ...clean.stats, expected: 127, flaky: 1 } }],
    ["failure", { ...clean, stats: { ...clean.stats, expected: 127, unexpected: 1 } }],
    ["global interruption", { ...clean, errors: [{ message: "Global teardown failed" }] }],
    ["empty run", { ...clean, stats: { ...clean.stats, expected: 0 } }],
    ["missing file", undefined], ["invalid JSON", "{"], ["partial stats", { stats: {} }],
    ["negative count", { ...clean, stats: { ...clean.stats, flaky: -1 } }],
  ])("blocks %s while retaining failed evidence", (_name, report) => {
    const result = run(report);
    expect(result.status).toBe(1);
    expect(result.evidence.suites[0].passed).toBe(false);
  });
});
