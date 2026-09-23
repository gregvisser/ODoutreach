import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PR #137 — `stopFollowUpsForLinkedReply` tests.
 *
 * Verifies:
 *   * Enrolments tied to the linked outbound's step-send are flipped
 *     from PENDING/PAUSED to COMPLETED.
 *   * EXCLUDED enrolments are never overwritten.
 *   * Already-COMPLETED enrolments are not double-stopped (idempotent).
 *   * Other clients' enrolments are never touched.
 *   * Outbounds with no step-send are no-ops.
 *   * Empty args short-circuit without DB calls.
 */

const prismaMock = vi.hoisted(() => ({
  clientEmailSequenceStepSend: {
    findMany: vi.fn(),
  },
  clientEmailSequenceEnrollment: {
    updateMany: vi.fn(),
  },
  outboundEmail: {
    updateMany: vi.fn(),
    findUnique: vi.fn(),
  },
  mailboxSendReservation: {
    updateMany: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

import { stopFollowUpsForLinkedReply } from "./stop-follow-ups-on-reply";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("stopFollowUpsForLinkedReply", () => {
  it("short-circuits when clientId or outboundEmailId is empty", async () => {
    const r1 = await stopFollowUpsForLinkedReply({
      clientId: "",
      outboundEmailId: "ob1",
    });
    const r2 = await stopFollowUpsForLinkedReply({
      clientId: "c1",
      outboundEmailId: "",
    });
    expect(r1.enrollmentsStopped).toBe(0);
    expect(r2.enrollmentsStopped).toBe(0);
    expect(prismaMock.clientEmailSequenceStepSend.findMany).not.toHaveBeenCalled();
    expect(
      prismaMock.clientEmailSequenceEnrollment.updateMany,
    ).not.toHaveBeenCalled();
  });

  it("returns 0 when no step-send rows reference the outbound", async () => {
    prismaMock.clientEmailSequenceStepSend.findMany.mockResolvedValue([]);

    const result = await stopFollowUpsForLinkedReply({
      clientId: "c1",
      outboundEmailId: "ob1",
    });

    expect(result.enrollmentsStopped).toBe(0);
    expect(
      prismaMock.clientEmailSequenceEnrollment.updateMany,
    ).not.toHaveBeenCalled();
  });

  it("flips a PENDING enrolment to COMPLETED", async () => {
    prismaMock.clientEmailSequenceStepSend.findMany.mockResolvedValue([
      {
        enrollmentId: "enr-1",
        enrollment: { id: "enr-1", status: "PENDING", clientId: "c1" },
      },
    ]);
    prismaMock.clientEmailSequenceEnrollment.updateMany.mockResolvedValue({
      count: 1,
    });

    const result = await stopFollowUpsForLinkedReply({
      clientId: "c1",
      outboundEmailId: "ob1",
    });

    expect(result.enrollmentsStopped).toBe(1);
    const call =
      prismaMock.clientEmailSequenceEnrollment.updateMany.mock.calls[0]![0]!;
    expect(call.where.id).toEqual({ in: ["enr-1"] });
    expect(call.where.clientId).toBe("c1");
    expect(call.where.status).toEqual({ in: ["PENDING", "PAUSED"] });
    expect(call.data.status).toBe("COMPLETED");
    expect(call.data.completedAt).toBeInstanceOf(Date);
  });

  it("flips a PAUSED enrolment to COMPLETED", async () => {
    prismaMock.clientEmailSequenceStepSend.findMany.mockResolvedValue([
      {
        enrollmentId: "enr-2",
        enrollment: { id: "enr-2", status: "PAUSED", clientId: "c1" },
      },
    ]);
    prismaMock.clientEmailSequenceEnrollment.updateMany.mockResolvedValue({
      count: 1,
    });

    const result = await stopFollowUpsForLinkedReply({
      clientId: "c1",
      outboundEmailId: "ob1",
    });

    expect(result.enrollmentsStopped).toBe(1);
  });

  it("never overwrites EXCLUDED enrolments", async () => {
    prismaMock.clientEmailSequenceStepSend.findMany.mockResolvedValue([
      {
        enrollmentId: "enr-x",
        enrollment: { id: "enr-x", status: "EXCLUDED", clientId: "c1" },
      },
    ]);

    const result = await stopFollowUpsForLinkedReply({
      clientId: "c1",
      outboundEmailId: "ob1",
    });

    expect(result.enrollmentsStopped).toBe(0);
    expect(
      prismaMock.clientEmailSequenceEnrollment.updateMany,
    ).not.toHaveBeenCalled();
  });

  it("is idempotent when enrolment is already COMPLETED", async () => {
    prismaMock.clientEmailSequenceStepSend.findMany.mockResolvedValue([
      {
        enrollmentId: "enr-3",
        enrollment: { id: "enr-3", status: "COMPLETED", clientId: "c1" },
      },
    ]);

    const result = await stopFollowUpsForLinkedReply({
      clientId: "c1",
      outboundEmailId: "ob1",
    });

    expect(result.enrollmentsStopped).toBe(0);
    expect(
      prismaMock.clientEmailSequenceEnrollment.updateMany,
    ).not.toHaveBeenCalled();
  });

  it("ignores step-sends whose enrolment belongs to another client", async () => {
    prismaMock.clientEmailSequenceStepSend.findMany.mockResolvedValue([
      {
        enrollmentId: "enr-foreign",
        enrollment: {
          id: "enr-foreign",
          status: "PENDING",
          clientId: "c2",
        },
      },
    ]);

    const result = await stopFollowUpsForLinkedReply({
      clientId: "c1",
      outboundEmailId: "ob1",
    });

    expect(result.enrollmentsStopped).toBe(0);
    expect(
      prismaMock.clientEmailSequenceEnrollment.updateMany,
    ).not.toHaveBeenCalled();
  });

  it("holds a queued follow-up on the same enrolment and leaves the replied send alone", async () => {
    prismaMock.clientEmailSequenceStepSend.findMany.mockImplementation(
      async (args: { where?: { outboundEmail?: unknown } }) => {
        if (args.where?.outboundEmail) {
          return [{ outboundEmailId: "follow-up-queued" }];
        }
        return [
          {
            enrollmentId: "enr-1",
            enrollment: { id: "enr-1", status: "PENDING", clientId: "c1" },
          },
        ];
      },
    );
    prismaMock.clientEmailSequenceEnrollment.updateMany.mockResolvedValue({
      count: 1,
    });
    prismaMock.outboundEmail.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.outboundEmail.findUnique.mockResolvedValue({
      mailboxIdentityId: null,
    });
    prismaMock.mailboxSendReservation.updateMany.mockResolvedValue({ count: 1 });

    const result = await stopFollowUpsForLinkedReply({
      clientId: "c1",
      outboundEmailId: "intro-sent",
    });

    expect(result).toEqual({ enrollmentsStopped: 1, followUpsHeld: 1 });
    const held = prismaMock.outboundEmail.updateMany.mock.calls[0]![0]!;
    expect(held.where.id).toBe("follow-up-queued");
    expect(held.where.dispatchStartedAt).toBeNull();
    expect(held.where.status).toEqual({ in: ["QUEUED", "PROCESSING"] });
    expect(held.data.status).toBe("FAILED");
    expect(held.data.lastErrorCode).toBe("REPLY_STOPPED_FOLLOWUP");
    expect(held.data.lastErrorMessage).toMatch(/reply arrived/i);
    expect(prismaMock.mailboxSendReservation.updateMany).toHaveBeenCalledWith({
      where: { outboundEmailId: "follow-up-queued", status: "RESERVED" },
      data: { status: "RELEASED" },
    });
  });

  it("scopes the lookup to the supplied clientId and outboundEmailId", async () => {
    prismaMock.clientEmailSequenceStepSend.findMany.mockResolvedValue([]);

    await stopFollowUpsForLinkedReply({
      clientId: "c-42",
      outboundEmailId: "ob-42",
    });

    const call =
      prismaMock.clientEmailSequenceStepSend.findMany.mock.calls[0]![0]!;
    expect(call.where.clientId).toBe("c-42");
    expect(call.where.outboundEmailId).toBe("ob-42");
  });
});
