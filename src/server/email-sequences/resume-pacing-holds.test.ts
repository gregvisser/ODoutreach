import { beforeEach, describe, expect, it, vi } from "vitest";

import { PACING_HOLD_REASON } from "@/lib/clients/outreach-sequence-send-staff-copy";

const { prismaMock, send } = vi.hoisted(() => ({
  prismaMock: {
    client: { findFirst: vi.fn() },
    staffUser: { findFirst: vi.fn() },
    clientEmailSequenceStepSend: { findMany: vi.fn() },
    aiOutreachCampaign: { findMany: vi.fn() },
  },
  send: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("./send-introduction", () => ({
  sendSequenceStepBatch: (...args: unknown[]) => send(...args),
  SequenceStepSendError: class SequenceStepSendError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.name = "SequenceStepSendError";
      this.code = code;
    }
  },
}));

import { resumePacingHeldSends } from "./resume-pacing-holds";

function row(sequenceId: string, blockedReason: string, status = "READY") {
  return {
    id: `row-${sequenceId}`,
    sequenceId,
    stepId: `step-${sequenceId}`,
    status,
    blockedReason,
    outboundEmailId: null,
    step: { category: "INTRODUCTION" as const },
  };
}

describe("resumePacingHeldSends", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.client.findFirst.mockResolvedValue({ id: "client-1" });
    prismaMock.staffUser.findFirst.mockResolvedValue({ id: "admin-1", role: "ADMIN", isActive: true });
    prismaMock.aiOutreachCampaign.findMany.mockResolvedValue([]);
    send.mockResolvedValue({ counts: { queued: 1 } });
  });

  it("re-dispatches each pacing-held sequence and leaves a do-not-contact row alone", async () => {
    prismaMock.clientEmailSequenceStepSend.findMany.mockResolvedValue([
      row("seq-jack", PACING_HOLD_REASON),
      row("seq-cam", "Held back by send pacing — Launch this sequence again then; it will not send on its own."),
      row("seq-dnc", "Recipient suppressed at dispatch (do-not-contact)."),
      row("seq-paused", "Enrollment is PAUSED — step skipped."),
    ]);

    const result = await resumePacingHeldSends({ clientId: "client-1" });

    expect(result.errors).toEqual([]);
    expect(result.resumedQueued).toBe(2);
    expect(send).toHaveBeenCalledTimes(2);
    const sequenceIds = send.mock.calls.map((call) => {
      const input = call[0] as { sequenceId: string; initiatedByAutomation?: boolean; autoSendMaxOverdueMs?: number };
      expect(input.initiatedByAutomation).toBeUndefined();
      expect(input.autoSendMaxOverdueMs).toBeUndefined();
      expect(input).toMatchObject({
        clientId: "client-1",
        category: "INTRODUCTION",
        confirmationPhrase: "SEND INTRODUCTION",
      });
      return input.sequenceId;
    });
    expect(sequenceIds).toEqual(["seq-jack", "seq-cam"]);
  });

  it("does not send when the client is paused", async () => {
    prismaMock.client.findFirst.mockResolvedValue(null);
    const result = await resumePacingHeldSends({ clientId: "client-1" });
    expect(result.resumedQueued).toBe(0);
    expect(send).not.toHaveBeenCalled();
    expect(prismaMock.clientEmailSequenceStepSend.findMany).not.toHaveBeenCalled();
  });
});
