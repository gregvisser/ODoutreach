import { beforeEach, describe, expect, it, vi } from "vitest";

const { findOrganisations, findClients, groupAi, groupMailboxes, groupOutbound } = vi.hoisted(() => ({
  findOrganisations: vi.fn(),
  findClients: vi.fn(),
  groupAi: vi.fn(),
  groupMailboxes: vi.fn(),
  groupOutbound: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    organisation: { findMany: findOrganisations },
    client: { findMany: findClients },
    aiUsageEvent: { groupBy: groupAi },
    clientMailboxIdentity: { groupBy: groupMailboxes },
    outboundEmail: { groupBy: groupOutbound },
  },
}));

import { loadPlatformOrganisationOverviews } from "./platform-overview";

const NOW = new Date("2026-10-02T15:00:00.000Z");

describe("loadPlatformOrganisationOverviews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findOrganisations.mockResolvedValue([
      {
        id: "org_opensdoors",
        name: "OpensDoors",
        slug: "opensdoors",
        status: "ACTIVE",
        rocketReachCreditsUsed: 2,
        rocketReachCreditAllowance: null,
        aiSpendCapMicroUsd: null,
        _count: { members: 3 },
      },
    ]);
    findClients.mockResolvedValue([{ id: "client-a", organisationId: "org_opensdoors" }]);
    groupAi.mockResolvedValue([
      { organisationId: "org_opensdoors", _sum: { costMicroUsd: 250_000 } },
      { organisationId: null, _sum: { costMicroUsd: 9 } },
    ]);
    groupMailboxes.mockResolvedValue([
      { clientId: "client-a", connectionStatus: "CONNECTED", _count: { _all: 2 } },
    ]);
    groupOutbound.mockImplementation(async (args: { where: { status?: string; sentAt?: { gte: Date } } }) => {
      if (args.where.status === "FAILED") return [];
      return [{ clientId: "client-a", _count: { _all: 4 } }];
    });
  });

  it("counts UTC-day sends and ignores AI rows that are not tied to an organisation", async () => {
    const rows = await loadPlatformOrganisationOverviews(NOW);

    const sentCall = groupOutbound.mock.calls.find(
      (call) => (call[0] as { where: { sentAt?: unknown } }).where.sentAt,
    );
    const failedCall = groupOutbound.mock.calls.find(
      (call) => (call[0] as { where: { status?: string } }).where.status === "FAILED",
    );
    expect(sentCall?.[0]).toMatchObject({
      where: { sentAt: { gte: new Date("2026-10-02T00:00:00.000Z") } },
    });
    expect(failedCall?.[0]).toMatchObject({
      where: { status: "FAILED", updatedAt: { gte: new Date("2026-10-02T00:00:00.000Z") } },
    });
    expect(groupMailboxes).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isActive: true, workspaceRemovedAt: null }),
      }),
    );
    expect(rows).toEqual([
      expect.objectContaining({
        id: "org_opensdoors",
        memberCount: 3,
        mailboxCount: 2,
        sendsToday: 4,
        failedSendsToday: 0,
        aiSpendMicroUsd: 250_000,
        health: "healthy",
        healthLabel: "Healthy",
      }),
    ]);
  });

  it("does not query mailboxes or sends when there are no clients", async () => {
    findClients.mockResolvedValue([]);
    const rows = await loadPlatformOrganisationOverviews(NOW);
    expect(groupMailboxes).not.toHaveBeenCalled();
    expect(groupOutbound).not.toHaveBeenCalled();
    expect(rows[0]?.mailboxCount).toBe(0);
    expect(rows[0]?.sendsToday).toBe(0);
  });
});
