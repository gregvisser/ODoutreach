import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StaffUser } from "@/generated/prisma/client";

const { prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    clientMailboxIdentity: { findMany: vi.fn() },
    outboundEmail: { findFirst: vi.fn(), findMany: vi.fn() },
    mailboxSendReservation: { count: vi.fn() },
    $transaction: vi.fn(),
  };
  return { prismaMock };
});

vi.mock("@/server/tenant/access", () => ({
  requireClientAccess: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/server/outreach/suppression-guard", () => ({
  evaluateSuppression: vi.fn(),
}));

vi.mock("@/server/email/outbound/trigger-queue", () => ({
  triggerOutboundQueueDrain: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

import { evaluateSuppression } from "@/server/outreach/suppression-guard";

import { queueControlledPilotBatch } from "./controlled-pilot-send";

const staff = { id: "staff1" } as StaffUser;

const baseMailbox = {
  id: "m1",
  clientId: "c1",
  email: "sender@bidlow.co.uk",
  emailNormalized: "sender@bidlow.co.uk",
  displayName: null,
  provider: "MICROSOFT" as const,
  connectionStatus: "CONNECTED" as const,
  isActive: true,
  isPrimary: true,
  canSend: true,
  canReceive: true,
  dailySendCap: 2,
  isSendingEnabled: true,
  emailsSentToday: 0,
  dailyWindowResetAt: null,
  lastSyncAt: null,
  lastError: null,
  oauthState: null,
  oauthStateExpiresAt: null,
  providerLinkedUserId: null,
  connectedAt: new Date(),
  createdByStaffUserId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("queueControlledPilotBatch", () => {
  beforeEach(() => {
    vi.mocked(evaluateSuppression).mockReset();
    prismaMock.outboundEmail.findFirst.mockReset();
    prismaMock.outboundEmail.findMany.mockReset();
    prismaMock.mailboxSendReservation.count.mockReset();
    prismaMock.clientMailboxIdentity.findMany.mockReset();
    prismaMock.$transaction.mockReset();
    prismaMock.clientMailboxIdentity.findMany.mockResolvedValue([]);
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

  it("blocks when no execution-eligible mailboxes", async () => {
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
    expect(r.error).toMatch(/No active connected sending mailboxes/i);
  });

  it("blocks when pool has no ledger capacity left", async () => {
    prismaMock.clientMailboxIdentity.findMany.mockResolvedValue([baseMailbox] as never);
    vi.mocked(evaluateSuppression).mockResolvedValue({ suppressed: false } as never);
    prismaMock.outboundEmail.findFirst.mockResolvedValue(null);

    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => Promise<unknown>) => {
      prismaMock.mailboxSendReservation.count.mockResolvedValue(2);
      return fn(prismaMock as never);
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
    if (r.ok) return;
    expect(r.error).toMatch(/No messages queued/i);
  });

  it("respects max batch size constant via parser (enforced before transaction)", async () => {
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
