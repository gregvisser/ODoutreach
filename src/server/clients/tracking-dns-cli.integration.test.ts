import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeEach, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { closeIntegrationPool, integrationDatabaseUrl, resetIntegrationDatabase } from "@/test/integration/database";

async function runCli(databaseUrl: string | undefined) {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error("Run using npm run test:integration");
  const guard = pathToFileURL(resolve("src/test/fixtures/forbid-tracking-network.mjs")).href;
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_OPTIONS: `--import=${guard}` };
  if (databaseUrl === undefined) delete env.DATABASE_URL;
  else env.DATABASE_URL = databaseUrl;
  return new Promise<{ code: number | null; output: string }>((resolveResult, reject) => {
    // Launch the real npm command; Vitest's aliases and mocks do not enter this process.
    const child = spawn(process.execPath, [npmCli, "run", "ops:tracking-dns-sweep"], { env, windowsHide: true });
    let output = "";
    child.stdout.on("data", (chunk) => { output += String(chunk); });
    child.stderr.on("data", (chunk) => { output += String(chunk); });
    const timer = setTimeout(() => { child.kill(); reject(new Error("Tracking CLI timed out")); }, 20_000);
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => { clearTimeout(timer); resolveResult({ code, output }); });
  });
}

beforeEach(async () => { await resetIntegrationDatabase(); });
afterAll(async () => { await prisma.$disconnect(); await closeIntegrationPool(); });

it.each([undefined, "   "])("rejects missing database configuration before loading persistence (%s)", async (url) => {
  const result = await runCli(url);
  expect(result.code).toBe(1);
  expect(result.output).toContain("DATABASE_URL is not configured");
  expect(result.output).not.toContain("sweep finished");
  expect(result.output).not.toContain("FORBIDDEN_TRACKING_NETWORK");
});

it("runs the actual command and leaves tracking-off clients unchanged", async () => {
  const before = await prisma.client.create({ data: { id: "off", name: "Tracking off", slug: "tracking-off", openTrackingEnabledAt: null } });
  const result = await runCli(integrationDatabaseUrl());
  expect(result.code, result.output).toBe(0);
  expect(result.output).toContain("checked 0, disabled 0");
  expect(result.output).toContain("1 current client(s) in the database; 0 currently have open tracking ON");
  expect(result.output).not.toContain("FORBIDDEN_TRACKING_NETWORK");
  expect(await prisma.client.findUniqueOrThrow({ where: { id: "off" } })).toEqual(before);
  expect(await prisma.auditLog.count()).toBe(0);
});

it("does not treat an empty database as proof that client tracking is safely off", async () => {
  const result = await runCli(integrationDatabaseUrl());
  expect(result.code).toBe(1);
  expect(result.output).toContain("No current clients found");
  expect(result.output).not.toContain("sweep finished");
  expect(result.output).not.toContain("FORBIDDEN_TRACKING_NETWORK");
});

it("persists a failed prerequisite check, switches tracking off, and records the audit through the real CLI", async () => {
  const enabledAt = new Date("2026-09-01T00:00:00Z");
  // No aligned mailbox is a failed prerequisite, so this case requires no DNS/HTTP.
  await prisma.client.createMany({ data: [
    { id: "on", name: "Missing prerequisites", slug: "missing-prerequisites", openTrackingEnabledAt: enabledAt, trackingDnsVerifiedAt: enabledAt },
    { id: "deleted", name: "Deleted", slug: "deleted", deletedAt: enabledAt, openTrackingEnabledAt: enabledAt },
  ] });
  const result = await runCli(integrationDatabaseUrl());
  expect(result.code, result.output).toBe(0);
  expect(result.output).toContain("checked 1, disabled 1");
  expect(result.output).not.toContain("Missing prerequisites");
  expect(result.output).not.toContain("(on)");
  expect(result.output).not.toContain("FORBIDDEN_TRACKING_NETWORK");
  const current = await prisma.client.findUniqueOrThrow({ where: { id: "on" } });
  expect(current.openTrackingEnabledAt).toBeNull();
  expect(current.trackingDnsVerifiedAt).toBeNull();
  expect(current.trackingDnsCheckedAt).toBeInstanceOf(Date);
  const audit = await prisma.auditLog.findMany({ where: { clientId: "on" } });
  expect(audit).toHaveLength(1);
  expect(audit[0].metadata).toMatchObject({ event: "open_tracking_disabled_dns_regression", enabled: false });
  expect((await prisma.client.findUniqueOrThrow({ where: { id: "deleted" } })).openTrackingEnabledAt).toEqual(enabledAt);
});

it("exits unsuccessfully when the configured database cannot be authenticated", async () => {
  const url = new URL(integrationDatabaseUrl());
  url.password = "synthetic-wrong-password";
  const result = await runCli(url.toString());
  expect(result.code).toBe(1);
  expect(result.output).toContain("Tracking-DNS sweep FAILED");
  expect(result.output).not.toContain("sweep finished");
  expect(result.output).not.toContain("FORBIDDEN_TRACKING_NETWORK");
});
