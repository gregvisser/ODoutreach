import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, expect, it, vi } from "vitest";

import { publicBatch, runScheduledOutreachTimer } from "../App_Data/jobs/triggered/odoutreach-scheduled-outreach/run.js";

const root = path.resolve(__dirname, "..");

afterEach(() => vi.unstubAllGlobals());

it("makes no request until the timer is explicitly on", async () => {
  const runner = vi.fn();
  expect(await runScheduledOutreachTimer({ enabled: undefined, secret: "test", runner })).toEqual({
    ok: true,
    skipped: true,
    reason: "timer-disabled",
  });
  expect(runner).not.toHaveBeenCalled();
});

it("refuses to start when the queue-recovery timer is also on", async () => {
  const runner = vi.fn();
  await expect(runScheduledOutreachTimer({
    enabled: "on",
    secret: "test",
    queueRecovery: "on",
    runner,
  })).rejects.toThrow(/queue recovery/i);
  expect(runner).not.toHaveBeenCalled();
});

it("runs the full scheduled outreach clock and logs counts only", async () => {
  const runner = vi.fn(async ({ onBatch }: { onBatch: (batch: Record<string, unknown>) => void }) => {
    onBatch({
      phase: "advance",
      ok: true,
      errors: ["ada@client.example must not be logged"],
      secret: "hidden",
    });
    return { ok: true, plannedClients: 2, plannedMailboxes: 3, attempted: 6, failed: 0, unverified: 0, skipped: 1 };
  });
  const logs: string[] = [];
  vi.spyOn(console, "log").mockImplementation((line: unknown) => { logs.push(String(line)); });
  const result = await runScheduledOutreachTimer({ enabled: "on", secret: "super-secret", runner });
  expect(result).toMatchObject({ ok: true, timerSkipped: false, plannedClients: 2, attempted: 6, failed: 0, skippedSteps: 1 });
  expect(runner).toHaveBeenCalledWith(expect.objectContaining({
    url: "https://opensdoors.bidlow.co.uk/api/internal/scheduled-outreach/v1",
    secret: "super-secret",
  }));
  expect(logs.join("\n")).not.toMatch(/ada@client|super-secret|hidden/);
  expect(JSON.parse(logs[0])).toMatchObject({ event: "scheduled-outreach-batch", phase: "advance", notes: 1 });
});

it("fails closed when the outreach run is not clean", async () => {
  const runner = vi.fn(async () => ({ ok: false, failed: 1, unverified: 0 }));
  await expect(runScheduledOutreachTimer({ enabled: "on", secret: "test", runner })).rejects.toThrow(/not complete/);
});

it("schedules a singleton five-minute tick offset from queue recovery", () => {
  const settings = JSON.parse(readFileSync(path.join(
    root,
    "App_Data/jobs/triggered/odoutreach-scheduled-outreach/settings.job",
  ), "utf8")) as { schedule: string; is_singleton: boolean };
  expect(settings).toEqual({ schedule: "30 */5 * * * *", is_singleton: true });
  const recovery = JSON.parse(readFileSync(path.join(
    root,
    "App_Data/jobs/triggered/odoutreach-queue-recovery/settings.job",
  ), "utf8")) as { schedule: string };
  expect(recovery.schedule).not.toBe(settings.schedule);
});

it("keeps GitHub as a manual and backup sender that can be stood down", () => {
  const workflow = readFileSync(path.join(root, ".github/workflows/process-outbound-queue.yml"), "utf8");
  expect(workflow).toContain('cron: "*/5 * * * *"');
  expect(workflow).toContain("github.event_name == 'workflow_dispatch' || vars.SCHEDULED_OUTREACH_RUNNER != 'azure'");
  expect(workflow).toContain("run-scheduled-outreach.mjs");
});

it("does not put prospect text into the platform batch line", () => {
  expect(publicBatch({ phase: "queue", ok: true, errors: ["secret body"] })).toEqual({
    event: "scheduled-outreach-batch",
    phase: "queue",
    ok: true,
    skipped: false,
    unverified: false,
    notes: 1,
  });
});
