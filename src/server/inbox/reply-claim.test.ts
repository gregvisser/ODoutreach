import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { claimUpsert, claimFindMany, claimDeleteMany } = vi.hoisted(() => ({
  claimUpsert: vi.fn(),
  claimFindMany: vi.fn(),
  claimDeleteMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    replyClaim: {
      upsert: claimUpsert,
      findMany: claimFindMany,
      deleteMany: claimDeleteMany,
    },
  },
}));

import {
  claimReplyForStaff,
  loadVisibleReplyClaim,
  releaseReplyClaims,
} from "./reply-claim";

const SUBJECT = { subjectType: "INBOUND_MESSAGE" as const, subjectId: "msg-1" };
const NOW = new Date("2026-08-26T12:00:00.000Z");

function minutesAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 60_000);
}

beforeEach(() => {
  vi.clearAllMocks();
  claimUpsert.mockResolvedValue({});
  claimFindMany.mockResolvedValue([]);
  claimDeleteMany.mockResolvedValue({ count: 0 });
});

describe("claimReplyForStaff", () => {
  it("writes a claim scoped by clientId, not by subject id alone", async () => {
    await claimReplyForStaff({
      clientId: "client-a",
      subject: SUBJECT,
      staffUserId: "staff-sarah",
      now: NOW,
    });

    expect(claimUpsert).toHaveBeenCalledTimes(1);
    const arg = claimUpsert.mock.calls[0]?.[0] as {
      where: {
        clientId_subjectType_subjectId_staffUserId: Record<string, unknown>;
      };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };

    // Tenant scoping is asserted, not assumed — every leg of the composite
    // key carries the clientId.
    expect(arg.where.clientId_subjectType_subjectId_staffUserId).toEqual({
      clientId: "client-a",
      subjectType: "INBOUND_MESSAGE",
      subjectId: "msg-1",
      staffUserId: "staff-sarah",
    });
    expect(arg.create).toMatchObject({
      clientId: "client-a",
      subjectType: "INBOUND_MESSAGE",
      subjectId: "msg-1",
      staffUserId: "staff-sarah",
      claimedAt: NOW,
    });
    // Re-opening refreshes the timestamp rather than adding a second row.
    expect(arg.update).toEqual({ claimedAt: NOW });
  });

  it("never throws — a claim failing must not take the reply page down", async () => {
    claimUpsert.mockRejectedValue(new Error("db down"));

    await expect(
      claimReplyForStaff({
        clientId: "client-a",
        subject: SUBJECT,
        staffUserId: "staff-sarah",
        now: NOW,
      }),
    ).resolves.toBeUndefined();
  });
});

describe("loadVisibleReplyClaim", () => {
  it("queries by clientId AND subject, and excludes stale rows in the query", async () => {
    await loadVisibleReplyClaim({
      clientId: "client-a",
      subject: SUBJECT,
      viewerStaffUserId: "staff-bob",
      now: NOW,
    });

    const arg = claimFindMany.mock.calls[0]?.[0] as {
      where: {
        clientId: string;
        subjectType: string;
        subjectId: string;
        claimedAt: { gt: Date };
      };
    };
    expect(arg.where.clientId).toBe("client-a");
    expect(arg.where.subjectType).toBe("INBOUND_MESSAGE");
    expect(arg.where.subjectId).toBe("msg-1");
    // 30 minutes before `now`.
    expect(arg.where.claimedAt.gt).toEqual(minutesAgo(30));
  });

  it("tells the second person who opened it and how long ago", async () => {
    claimFindMany.mockResolvedValue([
      {
        staffUserId: "staff-sarah",
        claimedAt: minutesAgo(2),
        staffUser: {
          displayName: "Sarah Okafor",
          email: "sarah@opensdoors.co.uk",
        },
      },
    ]);

    const visible = await loadVisibleReplyClaim({
      clientId: "client-a",
      subject: SUBJECT,
      viewerStaffUserId: "staff-bob",
      now: NOW,
    });

    expect(visible).toMatchObject({
      name: "Sarah Okafor",
      agoLabel: "2 minutes ago",
    });
  });

  it("says nothing to the person who made the claim", async () => {
    claimFindMany.mockResolvedValue([
      {
        staffUserId: "staff-bob",
        claimedAt: minutesAgo(2),
        staffUser: { displayName: "Bob", email: "bob@opensdoors.co.uk" },
      },
    ]);

    const visible = await loadVisibleReplyClaim({
      clientId: "client-a",
      subject: SUBJECT,
      viewerStaffUserId: "staff-bob",
      now: NOW,
    });

    expect(visible).toBeNull();
  });

  it("drops a stale row even if the database hands one back", async () => {
    // Belt and braces: the query filters by time, and so does the selector.
    claimFindMany.mockResolvedValue([
      {
        staffUserId: "staff-sarah",
        claimedAt: minutesAgo(45),
        staffUser: { displayName: "Sarah", email: "sarah@opensdoors.co.uk" },
      },
    ]);

    const visible = await loadVisibleReplyClaim({
      clientId: "client-a",
      subject: SUBJECT,
      viewerStaffUserId: "staff-bob",
      now: NOW,
    });

    expect(visible).toBeNull();
  });

  it("degrades to silence when the lookup fails", async () => {
    claimFindMany.mockRejectedValue(new Error("db down"));

    const visible = await loadVisibleReplyClaim({
      clientId: "client-a",
      subject: SUBJECT,
      viewerStaffUserId: "staff-bob",
      now: NOW,
    });

    expect(visible).toBeNull();
  });
});

describe("releaseReplyClaims", () => {
  it("clears every claim on the conversation, scoped by clientId", async () => {
    await releaseReplyClaims({ clientId: "client-a", subject: SUBJECT });

    expect(claimDeleteMany).toHaveBeenCalledWith({
      where: {
        clientId: "client-a",
        subjectType: "INBOUND_MESSAGE",
        subjectId: "msg-1",
      },
    });
  });

  it("never throws — releasing must not fail a send that already happened", async () => {
    claimDeleteMany.mockRejectedValue(new Error("db down"));

    await expect(
      releaseReplyClaims({ clientId: "client-a", subject: SUBJECT }),
    ).resolves.toBeUndefined();
  });
});
