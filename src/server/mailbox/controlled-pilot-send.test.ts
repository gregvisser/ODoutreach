import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StaffUser } from "@/generated/prisma/client";

const { prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    outboundEmail: { findFirst: vi.fn() },
    mailboxSendReservation: { count: vi.fn() },
    $transaction: vi.fn(),
  };
  return { prismaMock };
});

vi.mock("@/server/tenant/access", () => ({
  requireClientAccess: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/server/mailbox/sending-policy", async () => {
  const actual = await vi.importActual<typeof import("@/server/mailbox/sending-policy")>(
    "@/server/mailbox/sending-policy",
  );
  return {
    ...actual,
    loadGovernedSendingMailbox: vi.fn(),
  };
});

vi.mock("@/server/outreach/suppression-guard", () => ({
  evaluateSuppression: vi.fn(),
}));

vi.mock("@/server/email/outbound/trigger-queue", () => ({
  triggerOutboundQueueDrain: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

import { loadGovernedSendingMailbox } from "@/server/mailbox/sending-policy";
import { evaluateSuppression } from "@/server/outreach/suppression-guard";

import { queueControlledPilotBatch } from "./controlled-pilot-send";

const staff = { id: "staff1" } as StaffUser;

describe("queueControlledPilotBatch", () => {
  beforeEach(() => {
    vi.mocked(loadGovernedSendingMailbox).mockReset();
    vi.mocked(evaluateSuppression).mockReset();
    prismaMock.outboundEmail.findFirst.mockReset();
    prismaMock.mailboxSendReservation.count.mockReset();
    prismaMock.$transaction.mockReset();
  });

  it("blocks without confirmation phrase", async () => {
    const r = await queueControlledPilotBatch({
      staff,
      clientId: "c1",
      confirmationPhrase: "NOPE",
      recipientLines: "a@bidlow.co.uk",
      subject: "S",
      bodyText: "B",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/SEND PILOT/);
  });

  it("blocks without connected mailbox", async () => {
    vi.mocked(loadGovernedSendingMailbox).mockResolvedValue({
      mode: "ineligible",
      reason: "no_connected_sending_mailbox",
      mailbox: null,
    });

    const r = await queueControlledPilotBatch({
      staff,
      clientId: "c1",
      confirmationPhrase: "SEND PILOT",
      recipientLines: "a@bidlow.co.uk",
      subject: "S",
      bodyText: "B",
    });
    expect(r.ok).toBe(false);
  });

  it("blocks when batch exceeds remaining cap", async () => {
    vi.mocked(loadGovernedSendingMailbox).mockResolvedValue({
      mode: "governed",
      mailbox: {
        id: "m1",
        email: "sender@bidlow.co.uk",
        dailySendCap: 2,
      },
    } as never);

    vi.mocked(evaluateSuppression).mockResolvedValue({ suppressed: false } as never);
    prismaMock.outboundEmail.findFirst.mockResolvedValue(null);
    prismaMock.mailboxSendReservation.count.mockResolvedValue(2);

    const r = await queueControlledPilotBatch({
      staff,
      clientId: "c1",
      confirmationPhrase: "SEND PILOT",
      recipientLines: "a@bidlow.co.uk",
      subject: "S",
      bodyText: "B",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/capacity|slot/i);
  });

  it("respects max batch size constant via parser (enforced before transaction)", async () => {
    vi.mocked(loadGovernedSendingMailbox).mockResolvedValue({
      mode: "governed",
      mailbox: {
        id: "m1",
        email: "sender@bidlow.co.uk",
        dailySendCap: 30,
      },
    } as never);

    const lines = Array.from({ length: 12 }, (_, i) => `u${String(i)}@bidlow.co.uk`).join("\n");
    const r = await queueControlledPilotBatch({
      staff,
      clientId: "c1",
      confirmationPhrase: "SEND PILOT",
      recipientLines: lines,
      subject: "S",
      bodyText: "B",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/hard safety cap/i);
  });
});
