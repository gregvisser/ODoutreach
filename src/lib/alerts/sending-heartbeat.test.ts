import { describe, expect, it } from "vitest";

import { assessSendingHeartbeat, sendingWatchShouldAlert } from "./sending-heartbeat";

const now = new Date("2026-10-03T09:00:00.000Z");
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

describe("assessSendingHeartbeat", () => {
  it("fails when the WebJob has never reported", () => {
    const verdict = assessSendingHeartbeat(null, now);
    expect(verdict.conclusion).toBe("failure");
    expect(sendingWatchShouldAlert(verdict)).toBe(true);
  });

  it("is healthy when the last run was within 20 minutes", () => {
    const verdict = assessSendingHeartbeat(
      { lastRunAt: minutesAgo(4), lastQueueAt: minutesAgo(4), lastQueueOkAt: minutesAgo(4), lastQueueError: null, consecutiveQueueFailures: 0 },
      now,
    );
    expect(verdict.conclusion).toBe("success");
    expect(verdict.reasons[0]).toContain("09:56 UK time");
    expect(sendingWatchShouldAlert(verdict)).toBe(false);
  });

  it("fails when the WebJob stopped, and the watch stops repeating after three hours", () => {
    const fresh = assessSendingHeartbeat(
      { lastRunAt: minutesAgo(45), lastQueueAt: null, lastQueueOkAt: null, lastQueueError: null, consecutiveQueueFailures: 0 },
      now,
    );
    expect(fresh).toMatchObject({ conclusion: "failure", stale: true, minutesSinceRun: 45 });
    expect(sendingWatchShouldAlert(fresh)).toBe(true);
    const old = assessSendingHeartbeat(
      { lastRunAt: minutesAgo(600), lastQueueAt: null, lastQueueOkAt: null, lastQueueError: null, consecutiveQueueFailures: 0 },
      now,
    );
    expect(old.conclusion).toBe("failure");
    expect(sendingWatchShouldAlert(old)).toBe(false);
  });

  it("is partial after one failed drain and failed after three in a row", () => {
    const base = { lastRunAt: minutesAgo(2), lastQueueAt: minutesAgo(2), lastQueueOkAt: minutesAgo(30), lastQueueError: "Graph 503" };
    expect(assessSendingHeartbeat({ ...base, consecutiveQueueFailures: 1 }, now).conclusion).toBe("partial");
    const broken = assessSendingHeartbeat({ ...base, consecutiveQueueFailures: 3 }, now);
    expect(broken.conclusion).toBe("failure");
    expect(broken.reasons[0]).toContain("Graph 503");
    expect(sendingWatchShouldAlert(broken)).toBe(true);
  });
});
