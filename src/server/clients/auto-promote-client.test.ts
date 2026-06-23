import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  clientFindUnique,
  clientUpdateMany,
  auditCreate,
  loadSnapshot,
  refreshStale,
} = vi.hoisted(() => ({
  clientFindUnique: vi.fn(),
  clientUpdateMany: vi.fn(),
  auditCreate: vi.fn(),
  loadSnapshot: vi.fn(),
  refreshStale: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    client: { findUnique: clientFindUnique, updateMany: clientUpdateMany },
    auditLog: { create: auditCreate },
  },
}));
vi.mock("./launch-approval", () => ({
  loadClientLaunchApprovalSnapshot: (...a: unknown[]) => loadSnapshot(...a),
}));
vi.mock(
  "@/server/email-sequences/refresh-stale-client-inactive-step-sends",
  () => ({
    refreshStaleClientInactiveStepSends: (...a: unknown[]) => refreshStale(...a),
  }),
);

import { autoPromoteClientIfReady } from "./auto-promote-client";

const STAFF = {
  id: "staff1",
  role: "MANAGER",
  email: "s@opensdoors.co.uk",
} as unknown as Parameters<typeof autoPromoteClientIfReady>[1];

beforeEach(() => {
  vi.clearAllMocks();
  clientUpdateMany.mockResolvedValue({ count: 1 });
  auditCreate.mockResolvedValue({});
  refreshStale.mockResolvedValue({ stepsRefreshed: 1 });
});

describe("autoPromoteClientIfReady", () => {
  it("promotes a clear ONBOARDING client and refreshes stale client-inactive blocks", async () => {
    clientFindUnique.mockResolvedValue({ status: "ONBOARDING" });
    loadSnapshot.mockResolvedValue({
      clientStatus: "ONBOARDING",
      policy: { blockers: [], checklist: [] },
    });

    const res = await autoPromoteClientIfReady("c1", STAFF);

    expect(res).toMatchObject({ promoted: true, previousStatus: "ONBOARDING" });
    expect(clientUpdateMany).toHaveBeenCalledTimes(1);
    // The just-activated client gets its stale blocks refreshed automatically.
    expect(refreshStale).toHaveBeenCalledWith({
      clientId: "c1",
      staffUserId: "staff1",
    });
  });

  it("returns the blockers and does NOT refresh when the client isn't ready", async () => {
    clientFindUnique.mockResolvedValue({ status: "ONBOARDING" });
    loadSnapshot.mockResolvedValue({
      clientStatus: "ONBOARDING",
      policy: {
        blockers: ["A sender signature is not configured on any connected mailbox."],
        checklist: [],
      },
    });

    const res = await autoPromoteClientIfReady("c1", STAFF);

    expect(res).toMatchObject({ promoted: false, reason: "blockers_present" });
    expect(res).toHaveProperty("blockers");
    expect(clientUpdateMany).not.toHaveBeenCalled();
    expect(refreshStale).not.toHaveBeenCalled();
  });

  it("bails fast for an already-ACTIVE client (no refresh, no snapshot load)", async () => {
    clientFindUnique.mockResolvedValue({ status: "ACTIVE" });

    const res = await autoPromoteClientIfReady("c1", STAFF);

    expect(res).toMatchObject({ promoted: false, reason: "not_onboarding" });
    expect(loadSnapshot).not.toHaveBeenCalled();
    expect(refreshStale).not.toHaveBeenCalled();
  });

  it("still reports promoted even if the refresh pass throws (best-effort)", async () => {
    clientFindUnique.mockResolvedValue({ status: "ONBOARDING" });
    loadSnapshot.mockResolvedValue({
      clientStatus: "ONBOARDING",
      policy: { blockers: [], checklist: [] },
    });
    refreshStale.mockRejectedValue(new Error("boom"));

    const res = await autoPromoteClientIfReady("c1", STAFF);
    expect(res).toMatchObject({ promoted: true });
  });
});
