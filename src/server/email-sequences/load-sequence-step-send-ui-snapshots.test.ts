import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    clientEmailSequence: { findMany: vi.fn() },
    clientEmailSequenceStepSend: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

import { loadSequenceStepSendUiSnapshots } from "./send-introduction";

describe("loadSequenceStepSendUiSnapshots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOVERNED_TEST_EMAIL_DOMAINS = "bidlow.co.uk";
  });

  afterEach(() => {
    delete process.env.GOVERNED_TEST_EMAIL_DOMAINS;
  });

  it("uses eligibleInLaunchBatchNowCount without GOVERNED_TEST_EMAIL_DOMAINS gating sendable", async () => {
    prismaMock.clientEmailSequence.findMany.mockResolvedValue([
      {
        id: "seq-1",
        name: "Outreach A",
        status: "APPROVED",
        steps: [
          {
            id: "step-intro",
            category: "INTRODUCTION",
            position: 1,
            delayDays: 0,
            templateId: "t1",
            template: { status: "APPROVED" },
          },
        ],
        _count: { enrollments: 19 },
      },
    ] as never);

    const readyRows = Array.from({ length: 19 }, (_, i) => ({
      sequenceId: "seq-1",
      stepId: "step-intro",
      enrollmentId: `enr-${String(i)}`,
      status: "READY" as const,
      updatedAt: new Date("2026-05-01T12:00:00Z"),
      contact: { email: `p${String(i)}@corp.com` },
    }));
    prismaMock.clientEmailSequenceStepSend.findMany.mockResolvedValue(
      readyRows as never,
    );

    const { snapshots, allowlist } =
      await loadSequenceStepSendUiSnapshots("client-1");
    expect(allowlist.domains).toContain("bidlow.co.uk");
    const intro = snapshots.find(
      (s) => s.sequenceId === "seq-1" && s.category === "INTRODUCTION",
    );
    expect(intro).toBeDefined();
    expect(intro!.eligibleInLaunchBatchNowCount).toBe(19);
    expect(intro!.allowlistBlockedReadyCount).toBe(19);
    expect(intro!.sendable).toBe(true);
  });

  it("disables launch when READY rows have no email", async () => {
    prismaMock.clientEmailSequence.findMany.mockResolvedValue([
      {
        id: "seq-1",
        name: "Outreach A",
        status: "APPROVED",
        steps: [
          {
            id: "step-intro",
            category: "INTRODUCTION",
            position: 1,
            delayDays: 0,
            templateId: "t1",
            template: { status: "APPROVED" },
          },
        ],
        _count: { enrollments: 1 },
      },
    ] as never);

    prismaMock.clientEmailSequenceStepSend.findMany.mockResolvedValue([
      {
        sequenceId: "seq-1",
        stepId: "step-intro",
        enrollmentId: "enr-1",
        status: "READY",
        updatedAt: new Date("2026-05-01T12:00:00Z"),
        contact: { email: null },
      },
    ] as never);

    const { snapshots } = await loadSequenceStepSendUiSnapshots("client-1");
    const intro = snapshots.find(
      (s) => s.sequenceId === "seq-1" && s.category === "INTRODUCTION",
    );
    expect(intro).toBeDefined();
    expect(intro!.eligibleInLaunchBatchNowCount).toBe(0);
    expect(intro!.sendable).toBe(false);
    expect(intro!.disabledReason).toMatch(/missing an email address/i);
  });
});
