import { describe, expect, it } from "vitest";

import { shapeSendHealth } from "./send-health-report";

const now = new Date("2026-10-01T09:00:00.000Z");
const dayStart = new Date("2026-10-01T00:00:00.000Z");

describe("shapeSendHealth", () => {
  it("counts waiting mail, ages, caps, holds and due follow-ups without keeping a prospect address", () => {
    const report = shapeSendHealth({
      now,
      dayStart,
      clients: [
        { id: "b", name: "Beta", status: "ACTIVE" },
        { id: "a", name: "Alpha", status: "ONBOARDING" },
      ],
      statusCounts: [
        { clientId: "b", status: "QUEUED", count: 4 },
        { clientId: "b", status: "PROCESSING", count: 1 },
        { clientId: "b", status: "SENT", count: 9 },
        { clientId: "a", status: "FAILED", count: 2 },
      ],
      ages: [{ clientId: "b", oldestQueuedMinutes: 42.8, oldestProcessingMinutes: 3 }],
      sentToday: [{ clientId: "b", count: 6 }],
      failedToday: [{ clientId: "a", reason: "550 rejected ada@client.example", count: 2 }],
      held: [{ clientId: "b", reason: "Held back by send pacing", count: 5 }],
      mailboxClientIds: ["b", "a"],
      mailboxes: [
        { mailbox: "cam@client.example", cap: 30, bookedToday: 8, connected: true, sendingEnabled: true },
        { mailbox: "jack@client.example", cap: 20, bookedToday: 20, connected: false, sendingEnabled: true },
      ],
      dueFollowUps: [{ clientId: "b", count: 7 }],
    });

    expect(report.ok).toBe(true);
    expect(report.readOnly).toBe(true);
    expect(report.clients.map((client) => client.client)).toEqual(["Alpha", "Beta"]);
    expect(report.clients[1]).toMatchObject({
      waiting: 5,
      oldestQueuedMinutes: 42,
      oldestProcessingMinutes: 3,
      sentToday: 6,
      dueFollowUps: 7,
      outboundByStatus: { QUEUED: 4, PROCESSING: 1, SENT: 9 },
    });
    expect(report.clients[1].mailboxes).toEqual([
      { mailbox: "cam@client.example", cap: 30, bookedToday: 8, connected: true, sendingEnabled: true },
    ]);
    expect(report.clients[0].failedToday).toEqual([
      { reason: "550 rejected [redacted-email]", count: 2 },
    ]);
    expect(report.clients[0].failedTodayCount).toBe(2);
    expect(JSON.stringify(report)).not.toMatch(/ada@client/);
  });

  it("reports a quiet estate as empty counts rather than a failure", () => {
    const report = shapeSendHealth({
      now,
      dayStart,
      clients: [{ id: "a", name: "Alpha", status: "ACTIVE" }],
      statusCounts: [],
      ages: [],
      sentToday: [],
      failedToday: [],
      held: [],
      mailboxClientIds: [],
      mailboxes: [],
      dueFollowUps: [],
    });
    expect(report.clients[0]).toMatchObject({
      waiting: 0,
      oldestQueuedMinutes: null,
      sentToday: 0,
      failedTodayCount: 0,
      dueFollowUps: 0,
      mailboxes: [],
    });
  });
});
