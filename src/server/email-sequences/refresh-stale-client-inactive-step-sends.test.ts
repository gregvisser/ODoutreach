import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { stepSendFindMany, planStepSends } = vi.hoisted(() => ({
  stepSendFindMany: vi.fn(),
  planStepSends: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    clientEmailSequenceStepSend: { findMany: stepSendFindMany },
  },
}));

vi.mock("./step-sends", () => ({
  planSequenceStepSends: (...args: unknown[]) => planStepSends(...args),
}));

import { refreshStaleClientInactiveStepSends } from "./refresh-stale-client-inactive-step-sends";

beforeEach(() => {
  vi.clearAllMocks();
  planStepSends.mockResolvedValue({});
});

describe("refreshStaleClientInactiveStepSends", () => {
  it("only targets BLOCKED/SUPPRESSED rows whose reason holds the client-inactive code, de-duped per step", async () => {
    stepSendFindMany.mockResolvedValue([]);

    await refreshStaleClientInactiveStepSends({
      clientId: "c1",
      staffUserId: "staff1",
    });

    expect(stepSendFindMany).toHaveBeenCalledTimes(1);
    const arg = stepSendFindMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({
      clientId: "c1",
      status: { in: ["BLOCKED", "SUPPRESSED"] },
      blockedReason: { contains: "blocked_client_inactive" },
    });
    expect(arg.distinct).toEqual(["sequenceId", "stepId"]);
  });

  it("re-runs the records-only planner once per affected step", async () => {
    stepSendFindMany.mockResolvedValue([
      { sequenceId: "seq-1", stepId: "step-1" },
      { sequenceId: "seq-2", stepId: "step-2" },
    ]);

    const res = await refreshStaleClientInactiveStepSends({
      clientId: "c1",
      staffUserId: "staff1",
    });

    expect(planStepSends).toHaveBeenCalledTimes(2);
    expect(planStepSends).toHaveBeenCalledWith({
      clientId: "c1",
      sequenceId: "seq-1",
      stepId: "step-1",
      staffUserId: "staff1",
    });
    expect(res.stepsRefreshed).toBe(2);
  });

  it("does nothing when no stale rows exist (cheap no-op)", async () => {
    stepSendFindMany.mockResolvedValue([]);
    const res = await refreshStaleClientInactiveStepSends({
      clientId: "c1",
      staffUserId: "staff1",
    });
    expect(planStepSends).not.toHaveBeenCalled();
    expect(res.stepsRefreshed).toBe(0);
  });

  it("skips a step that fails to re-plan and still processes the rest", async () => {
    stepSendFindMany.mockResolvedValue([
      { sequenceId: "seq-1", stepId: "step-1" },
      { sequenceId: "seq-2", stepId: "step-2" },
    ]);
    planStepSends
      .mockRejectedValueOnce(new Error("NO_ENROLLMENTS"))
      .mockResolvedValueOnce({});

    const res = await refreshStaleClientInactiveStepSends({
      clientId: "c1",
      staffUserId: "staff1",
    });

    expect(planStepSends).toHaveBeenCalledTimes(2);
    expect(res.stepsRefreshed).toBe(1);
  });
});
