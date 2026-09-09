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
import { STALE_RECIPIENTS_CLIENT_NOW_LIVE_REASON } from "@/lib/clients/outreach-sequence-send-staff-copy";

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

  it("does not disable when all rows are SENT (step complete)", async () => {
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
        _count: { enrollments: 18 },
      },
    ] as never);

    const sentRows = Array.from({ length: 18 }, (_, i) => ({
      sequenceId: "seq-1",
      stepId: "step-intro",
      enrollmentId: `enr-${String(i)}`,
      status: "SENT" as const,
      updatedAt: new Date("2026-05-01T12:00:00Z"),
      contact: { email: `p${String(i)}@corp.com` },
    }));
    prismaMock.clientEmailSequenceStepSend.findMany.mockResolvedValue(
      sentRows as never,
    );

    const { snapshots } = await loadSequenceStepSendUiSnapshots("client-1");
    const intro = snapshots.find(
      (s) => s.sequenceId === "seq-1" && s.category === "INTRODUCTION",
    );
    expect(intro).toBeDefined();
    expect(intro!.sentCount).toBe(18);
    expect(intro!.readyCount).toBe(0);
    expect(intro!.blockedCount).toBe(0);
    expect(intro!.sendable).toBe(true);
    expect(intro!.disabledReason).toBeNull();
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


  it("keeps an hours-only follow-up waiting until the full delay elapses", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-09T17:00:00Z"));
    try {
      prismaMock.clientEmailSequence.findMany.mockResolvedValue([{
        id: "seq-1", name: "Hours", status: "APPROVED", _count: { enrollments: 1 },
        steps: [
          { id: "intro", category: "INTRODUCTION", position: 1, delayDays: 0, delayHours: 0, template: { status: "APPROVED" } },
          { id: "follow", category: "FOLLOW_UP_1", position: 2, delayDays: 0, delayHours: 2, template: { status: "APPROVED" } },
        ],
      }]);
      prismaMock.clientEmailSequenceStepSend.findMany.mockResolvedValue([
        { sequenceId: "seq-1", stepId: "intro", enrollmentId: "enr-1", status: "SENT", updatedAt: new Date("2026-09-09T16:00:00Z"), contact: { email: "lead@company.example" } },
        { sequenceId: "seq-1", stepId: "follow", enrollmentId: "enr-1", status: "READY", updatedAt: new Date("2026-09-09T16:01:00Z"), contact: { email: "lead@company.example" } },
      ]);
      const waiting = (await loadSequenceStepSendUiSnapshots("client-1")).snapshots[1];
      expect(waiting.delayHours).toBe(2);
      expect(waiting.delayPendingCount).toBe(1);
      expect(waiting.eligibleInLaunchBatchNowCount).toBe(0);
      expect(waiting.earliestEligibleAtIso).toBe("2026-09-09T18:00:00.000Z");
      vi.setSystemTime(new Date("2026-09-09T18:00:00Z"));
      const due = (await loadSequenceStepSendUiSnapshots("client-1")).snapshots[1];
      expect(due.delayPendingCount).toBe(0);
      expect(due.eligibleInLaunchBatchNowCount).toBe(1);
    } finally { vi.useRealTimers(); }
  });

  describe("stale 'client not active' block after the client goes live", () => {
    const clientInactiveBlockedRows = [
      {
        sequenceId: "seq-1",
        stepId: "step-intro",
        enrollmentId: "enr-1",
        status: "BLOCKED" as const,
        blockedReason:
          "[blocked_client_inactive] Client is ONBOARDING, not ACTIVE — activate the client before launching live sequences.",
        updatedAt: new Date("2026-05-01T12:00:00Z"),
        contact: { email: "lead@corp.com" },
      },
    ];

    function mockSequenceWithBlockedRow() {
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
      prismaMock.clientEmailSequenceStepSend.findMany.mockResolvedValue(
        clientInactiveBlockedRows as never,
      );
    }

    it("emits the refresh marker when the client is now ACTIVE (not the onboarding copy)", async () => {
      mockSequenceWithBlockedRow();
      const { snapshots } = await loadSequenceStepSendUiSnapshots("client-1", {
        clientIsActive: true,
      });
      const intro = snapshots.find((s) => s.category === "INTRODUCTION");
      expect(intro!.blockedCount).toBe(1);
      expect(intro!.sendable).toBe(false);
      expect(intro!.disabledReason).toBe(STALE_RECIPIENTS_CLIENT_NOW_LIVE_REASON);
    });

    it("keeps the raw 'recipients blocked' reason while the client is still onboarding", async () => {
      mockSequenceWithBlockedRow();
      const { snapshots } = await loadSequenceStepSendUiSnapshots("client-1");
      const intro = snapshots.find((s) => s.category === "INTRODUCTION");
      expect(intro!.disabledReason).not.toBe(
        STALE_RECIPIENTS_CLIENT_NOW_LIVE_REASON,
      );
      expect(intro!.disabledReason).toMatch(/recipient.*blocked/i);
    });
  });
});
