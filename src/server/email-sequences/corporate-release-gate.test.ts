import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `loadCorporateReleaseAllowance` — the four-at-a-time gate against real rows.
 *
 * The pure decision is proven in `@/lib/outreach/manual-send-window`. What
 * matters HERE is the wiring: that the gate reads this client's mailboxes, that
 * it returns an allowance the dispatcher can only ever narrow with, and — the
 * failure this project keeps repeating — that it is genuinely INERT for a
 * client nobody has graded, rather than quietly gating everyone.
 */
const { outboundFindMany } = vi.hoisted(() => ({
  outboundFindMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    outboundEmail: {
      findMany: (...a: unknown[]) => outboundFindMany(...a),
    },
  },
}));

import { loadCorporateReleaseAllowance } from "./corporate-release-gate";

const NOW = new Date("2026-08-28T14:00:00.000Z");
const WINDOW_START = new Date("2026-08-28T00:00:00.000Z");

function minutesAgo(m: number): Date {
  return new Date(NOW.getTime() - m * 60 * 1000);
}

describe("loadCorporateReleaseAllowance", () => {
  beforeEach(() => {
    outboundFindMany.mockReset().mockResolvedValue([]);
  });

  it("is completely inert for a client nobody has graded", async () => {
    const allowance = await loadCorporateReleaseAllowance({
      clientId: "client-1",
      grade: null,
      mailboxIds: ["mb-1", "mb-2"],
      now: NOW,
      windowStart: WINDOW_START,
    });

    expect(allowance.size).toBe(0);
    // The important half: it did not even ask the database. An ungraded client
    // costs nothing and behaves exactly as it did before this shipped.
    expect(outboundFindMany).not.toHaveBeenCalled();
  });

  it("is inert for MID and STANDARD too", async () => {
    for (const grade of ["MID", "STANDARD"] as const) {
      const allowance = await loadCorporateReleaseAllowance({
        clientId: "client-1",
        grade,
        mailboxIds: ["mb-1"],
        now: NOW,
        windowStart: WINDOW_START,
      });
      expect(allowance.size).toBe(0);
    }
    expect(outboundFindMany).not.toHaveBeenCalled();
  });

  it("releases four per mailbox for a corporate client that has sent nothing today", async () => {
    const allowance = await loadCorporateReleaseAllowance({
      clientId: "client-1",
      grade: "CORPORATE",
      mailboxIds: ["mb-1", "mb-2"],
      now: NOW,
      windowStart: WINDOW_START,
    });

    expect(allowance.get("mb-1")).toBe(4);
    expect(allowance.get("mb-2")).toBe(4);
  });

  it("holds a mailbox at zero for 45 minutes after it completes a group of four", async () => {
    outboundFindMany.mockResolvedValue([
      { mailboxIdentityId: "mb-1", createdAt: minutesAgo(5) },
      { mailboxIdentityId: "mb-1", createdAt: minutesAgo(6) },
      { mailboxIdentityId: "mb-1", createdAt: minutesAgo(7) },
      { mailboxIdentityId: "mb-1", createdAt: minutesAgo(8) },
    ]);

    const allowance = await loadCorporateReleaseAllowance({
      clientId: "client-1",
      grade: "CORPORATE",
      mailboxIds: ["mb-1"],
      now: NOW,
      windowStart: WINDOW_START,
    });

    expect(allowance.get("mb-1")).toBe(0);
  });

  it("gives each mailbox its own clock", async () => {
    // mb-1 has just finished a group; mb-2 has sent nothing. They must not
    // share a wait — this is the "per mailbox, per account" requirement.
    outboundFindMany.mockResolvedValue([
      { mailboxIdentityId: "mb-1", createdAt: minutesAgo(1) },
      { mailboxIdentityId: "mb-1", createdAt: minutesAgo(2) },
      { mailboxIdentityId: "mb-1", createdAt: minutesAgo(3) },
      { mailboxIdentityId: "mb-1", createdAt: minutesAgo(4) },
    ]);

    const allowance = await loadCorporateReleaseAllowance({
      clientId: "client-1",
      grade: "CORPORATE",
      mailboxIds: ["mb-1", "mb-2"],
      now: NOW,
      windowStart: WINDOW_START,
    });

    expect(allowance.get("mb-1")).toBe(0);
    expect(allowance.get("mb-2")).toBe(4);
  });

  it("lets a mailbox finish a part-sent group without waiting", async () => {
    outboundFindMany.mockResolvedValue([
      { mailboxIdentityId: "mb-1", createdAt: minutesAgo(200) },
      { mailboxIdentityId: "mb-1", createdAt: minutesAgo(201) },
      { mailboxIdentityId: "mb-1", createdAt: minutesAgo(202) },
    ]);

    const allowance = await loadCorporateReleaseAllowance({
      clientId: "client-1",
      grade: "CORPORATE",
      mailboxIds: ["mb-1"],
      now: NOW,
      windowStart: WINDOW_START,
    });

    expect(allowance.get("mb-1")).toBe(1);
  });

  it("releases the next group once 45 minutes have passed", async () => {
    outboundFindMany.mockResolvedValue([
      { mailboxIdentityId: "mb-1", createdAt: minutesAgo(46) },
      { mailboxIdentityId: "mb-1", createdAt: minutesAgo(47) },
      { mailboxIdentityId: "mb-1", createdAt: minutesAgo(48) },
      { mailboxIdentityId: "mb-1", createdAt: minutesAgo(49) },
    ]);

    const allowance = await loadCorporateReleaseAllowance({
      clientId: "client-1",
      grade: "CORPORATE",
      mailboxIds: ["mb-1"],
      now: NOW,
      windowStart: WINDOW_START,
    });

    expect(allowance.get("mb-1")).toBe(4);
  });

  it("scopes the query to this client and this day, not the whole workspace", async () => {
    await loadCorporateReleaseAllowance({
      clientId: "client-1",
      grade: "CORPORATE",
      mailboxIds: ["mb-1"],
      now: NOW,
      windowStart: WINDOW_START,
    });

    // Enabling the gate for one client must never read or gate another's rows.
    const args = outboundFindMany.mock.calls[0]?.[0] as {
      where: { clientId: string; createdAt: { gte: Date } };
    };
    expect(args.where.clientId).toBe("client-1");
    expect(args.where.createdAt.gte).toEqual(WINDOW_START);
  });

  it("never returns more than a group, whatever the history says", async () => {
    // A mailbox with a huge backlog of sends must still only get a group.
    outboundFindMany.mockResolvedValue(
      Array.from({ length: 40 }, (_, i) => ({
        mailboxIdentityId: "mb-1",
        createdAt: minutesAgo(200 + i),
      })),
    );

    const allowance = await loadCorporateReleaseAllowance({
      clientId: "client-1",
      grade: "CORPORATE",
      mailboxIds: ["mb-1"],
      now: NOW,
      windowStart: WINDOW_START,
    });

    expect(allowance.get("mb-1")).toBeLessThanOrEqual(4);
  });
});
