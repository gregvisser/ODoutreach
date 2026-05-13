import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => {
  const txMock = {
    clientEmailSequenceStepSend: { deleteMany: vi.fn() },
    clientEmailSequenceEnrollment: { deleteMany: vi.fn() },
    clientEmailSequenceStep: { deleteMany: vi.fn() },
    clientEmailSequence: { delete: vi.fn() },
  };
  return {
    prismaMock: {
      clientEmailSequence: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      clientEmailSequenceStepSend: { findFirst: vi.fn() },
      $transaction: vi.fn((fn: (tx: typeof txMock) => Promise<void>) =>
        fn(txMock),
      ),
      _tx: txMock,
    },
  };
});

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

import { deleteOrArchiveSequence } from "./mutations";

describe("deleteOrArchiveSequence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hard-deletes a sequence with no send history", async () => {
    prismaMock.clientEmailSequence.findUnique.mockResolvedValue({
      id: "seq-1",
      clientId: "client-1",
      name: "Test Seq",
      status: "DRAFT",
    });
    prismaMock.clientEmailSequenceStepSend.findFirst.mockResolvedValue(null);
    prismaMock._tx.clientEmailSequenceStepSend.deleteMany.mockResolvedValue({
      count: 5,
    });
    prismaMock._tx.clientEmailSequenceEnrollment.deleteMany.mockResolvedValue({
      count: 3,
    });
    prismaMock._tx.clientEmailSequenceStep.deleteMany.mockResolvedValue({
      count: 1,
    });
    prismaMock._tx.clientEmailSequence.delete.mockResolvedValue({
      id: "seq-1",
    });

    const result = await deleteOrArchiveSequence({
      sequenceId: "seq-1",
      clientId: "client-1",
      staffUserId: "staff-1",
    });

    expect(result.action).toBe("deleted");
    expect(result.message).toContain("Deleted");
    expect(result.message).toContain("Contacts and lists were not removed");
    expect(prismaMock._tx.clientEmailSequenceStepSend.deleteMany).toHaveBeenCalled();
    expect(prismaMock._tx.clientEmailSequenceEnrollment.deleteMany).toHaveBeenCalled();
    expect(prismaMock._tx.clientEmailSequenceStep.deleteMany).toHaveBeenCalled();
    expect(prismaMock._tx.clientEmailSequence.delete).toHaveBeenCalled();
  });

  it("archives instead when sequence has SENT step-send history", async () => {
    prismaMock.clientEmailSequence.findUnique.mockResolvedValue({
      id: "seq-2",
      clientId: "client-1",
      name: "Live Seq",
      status: "APPROVED",
    });
    prismaMock.clientEmailSequenceStepSend.findFirst.mockResolvedValue({
      id: "ss-1",
    });
    prismaMock.clientEmailSequence.update.mockResolvedValue({
      id: "seq-2",
      status: "ARCHIVED",
    });

    const result = await deleteOrArchiveSequence({
      sequenceId: "seq-2",
      clientId: "client-1",
      staffUserId: "staff-1",
    });

    expect(result.action).toBe("archived");
    expect(result.message).toContain("send history");
    expect(result.message).toContain("archived instead");
    expect(result.message).toContain("Contacts and lists were not removed");
    expect(prismaMock._tx.clientEmailSequence.delete).not.toHaveBeenCalled();
  });

  it("does not delete contacts, ContactUniverse, or ContactList", async () => {
    prismaMock.clientEmailSequence.findUnique.mockResolvedValue({
      id: "seq-3",
      clientId: "client-1",
      name: "Clean Seq",
      status: "DRAFT",
    });
    prismaMock.clientEmailSequenceStepSend.findFirst.mockResolvedValue(null);
    prismaMock._tx.clientEmailSequenceStepSend.deleteMany.mockResolvedValue({
      count: 0,
    });
    prismaMock._tx.clientEmailSequenceEnrollment.deleteMany.mockResolvedValue({
      count: 0,
    });
    prismaMock._tx.clientEmailSequenceStep.deleteMany.mockResolvedValue({
      count: 0,
    });
    prismaMock._tx.clientEmailSequence.delete.mockResolvedValue({
      id: "seq-3",
    });

    await deleteOrArchiveSequence({
      sequenceId: "seq-3",
      clientId: "client-1",
      staffUserId: "staff-1",
    });

    const txCalls = [
      prismaMock._tx.clientEmailSequenceStepSend.deleteMany,
      prismaMock._tx.clientEmailSequenceEnrollment.deleteMany,
      prismaMock._tx.clientEmailSequenceStep.deleteMany,
      prismaMock._tx.clientEmailSequence.delete,
    ];
    for (const fn of txCalls) {
      for (const call of fn.mock.calls) {
        const arg = call[0] as { where?: Record<string, unknown> };
        if (arg?.where) {
          expect(Object.keys(arg.where)).not.toContain("contactId");
          expect(Object.keys(arg.where)).not.toContain("contactListId");
        }
      }
    }
  });

  it("rejects when sequence belongs to a different client", async () => {
    prismaMock.clientEmailSequence.findUnique.mockResolvedValue({
      id: "seq-4",
      clientId: "other-client",
      name: "Wrong Client Seq",
      status: "DRAFT",
    });

    await expect(
      deleteOrArchiveSequence({
        sequenceId: "seq-4",
        clientId: "client-1",
        staffUserId: "staff-1",
      }),
    ).rejects.toThrow(/different client/i);
  });
});
