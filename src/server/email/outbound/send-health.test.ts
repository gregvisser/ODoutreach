import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clients: vi.fn(),
  statusCounts: vi.fn(),
  sentToday: vi.fn(),
  failedToday: vi.fn(),
  held: vi.fn(),
  mailboxes: vi.fn(),
  booked: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    client: { findMany: mocks.clients },
    outboundEmail: { groupBy: vi.fn() },
    clientEmailSequenceStepSend: { groupBy: mocks.held },
    clientMailboxIdentity: { findMany: mocks.mailboxes },
    mailboxSendReservation: { groupBy: mocks.booked },
    $queryRaw: mocks.queryRaw,
  },
}));

const { loadOutboundSendHealth } = await import("./send-health");
const { prisma } = await import("@/lib/db");

describe("loadOutboundSendHealth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.clients.mockResolvedValue([{ id: "client", name: "Opens", status: "ACTIVE" }]);
    (prisma.outboundEmail.groupBy as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ clientId: "client", status: "QUEUED", _count: { _all: 2 } }])
      .mockResolvedValueOnce([{ clientId: "client", _count: { _all: 1 } }])
      .mockResolvedValueOnce([{ clientId: "client", lastErrorMessage: "mailbox full", _count: { _all: 1 } }]);
    mocks.held.mockResolvedValue([{ clientId: "client", blockedReason: "Held back by send pacing", _count: { _all: 3 } }]);
    mocks.mailboxes.mockResolvedValue([{
      id: "box",
      clientId: "client",
      email: "sender@client.example",
      dailySendCap: 30,
      isSendingEnabled: true,
      connectionStatus: "CONNECTED",
    }]);
    mocks.booked.mockResolvedValue([{ mailboxIdentityId: "box", _count: { _all: 4 } }]);
    mocks.queryRaw.mockImplementation((parts: TemplateStringsArray) => {
      const sql = parts.join(" ");
      if (sql.includes("oldestQueuedMinutes")) {
        return [{ clientId: "client", oldestQueuedMinutes: 15, oldestProcessingMinutes: null }];
      }
      if (sql.includes("COUNT(*)")) return [{ clientId: "client", due: 2 }];
      throw new Error("unexpected query");
    });
  });

  it("reads counts and does not write", async () => {
    const report = await loadOutboundSendHealth(new Date("2026-10-01T09:30:00.000Z"));
    expect(report.clients[0]).toMatchObject({
      client: "Opens",
      waiting: 2,
      oldestQueuedMinutes: 15,
      sentToday: 1,
      failedTodayCount: 1,
      dueFollowUps: 2,
      mailboxes: [{ mailbox: "sender@client.example", cap: 30, bookedToday: 4, connected: true }],
      held: [{ reason: "Held back by send pacing", count: 3 }],
    });
    const source = readFileSync(join(process.cwd(), "src/server/email/outbound/send-health.ts"), "utf8");
    expect(source).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP)\b/);
    const workflow = readFileSync(join(process.cwd(), ".github/workflows/outbound-send-health.yml"), "utf8");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("schedule:");
    expect(workflow).toContain("-X GET");
  });

  it("returns an empty report when there are no workspaces", async () => {
    mocks.clients.mockResolvedValue([]);
    const report = await loadOutboundSendHealth(new Date("2026-10-01T09:30:00.000Z"));
    expect(report.clients).toEqual([]);
    expect(prisma.outboundEmail.groupBy).not.toHaveBeenCalled();
  });
});
