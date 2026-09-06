import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ClientMailboxIdentity, StaffUser } from "@/generated/prisma/client";

const { prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    client: { findFirst: vi.fn() },
    clientMailboxIdentity: { findFirst: vi.fn(), findFirstOrThrow: vi.fn() },
    outboundEmail: { create: vi.fn(), findFirstOrThrow: vi.fn() },
    mailboxSendReservation: {
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    unsubscribeToken: { create: vi.fn() },
    auditLog: { create: vi.fn() },
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
import { triggerOutboundQueueDrain } from "@/server/email/outbound/trigger-queue";

import { queueSelectedMailboxInternalProofSend } from "./internal-proof-send";

const staff = { id: "staff1" } as StaffUser;

const baseMailbox: ClientMailboxIdentity = {
  id: "mailbox-1",
  clientId: "client-1",
  email: "adam@opensdoors.co.uk",
  emailNormalized: "adam@opensdoors.co.uk",
  displayName: "Adam",
  provider: "MICROSOFT" as const,
  connectionStatus: "CONNECTED" as const,
  isActive: true,
  isPrimary: false,
  canSend: true,
  canReceive: true,
  dailySendCap: 30,
  isSendingEnabled: true,
  emailsSentToday: 0,
  dailyWindowResetAt: null,
  inboxSyncCursor: null,
  lastSyncAt: null,
  lastError: null,
  oauthState: null,
  oauthStateExpiresAt: null,
  providerLinkedUserId: "provider-user",
  connectedAt: new Date("2026-05-06T00:00:00Z"),
  createdByStaffUserId: null,
  workspaceRemovedAt: null,
  workspaceRemovedById: null,
  workspaceRemovedNote: null,
  createdAt: new Date("2026-05-06T00:00:00Z"),
  updatedAt: new Date("2026-05-06T00:00:00Z"),
  senderDisplayName: "Adam OpensDoors",
  senderPhone: null,
  senderSignatureHtml: null,
  senderSignatureText: "Adam OpensDoors\nOpensDoors",
  senderSignatureSource: "manual",
  senderSignatureSyncedAt: new Date("2026-05-06T00:00:00Z"),
  senderSignatureSyncError: null,
};

function validInput(overrides: Partial<Parameters<typeof queueSelectedMailboxInternalProofSend>[0]> = {}) {
  return {
    staff,
    clientId: "client-1",
    mailboxIdentityId: "mailbox-1",
    toEmail: "greg@bidlow.co.uk",
    subject: "Proof subject",
    bodyText: "Proof body",
    confirmationPhrase: "SEND INTERNAL PROOF",
    ...overrides,
  };
}

function setupHappyPath(mailbox = baseMailbox) {
  prismaMock.client.findFirst.mockResolvedValue({
    id: "client-1",
    defaultSenderEmail: null,
  });
  prismaMock.clientMailboxIdentity.findFirst.mockResolvedValue(mailbox);
  prismaMock.clientMailboxIdentity.findFirstOrThrow.mockResolvedValue(mailbox);
  vi.mocked(evaluateSuppression).mockResolvedValue({ suppressed: false } as never);
  prismaMock.mailboxSendReservation.findFirst.mockResolvedValue(null);
  prismaMock.mailboxSendReservation.count
    .mockResolvedValueOnce(0)
    .mockResolvedValueOnce(1);
  prismaMock.mailboxSendReservation.create.mockResolvedValue({
    id: "reservation-1",
  });
  prismaMock.mailboxSendReservation.update.mockResolvedValue({});
  prismaMock.outboundEmail.create.mockResolvedValue({
    id: "outbound-1",
    correlationId: "corr-1",
  });
  prismaMock.auditLog.create.mockResolvedValue({ id: "audit-1" });
  prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => Promise<unknown>) =>
    fn(prismaMock as never),
  );
}

describe("queueSelectedMailboxInternalProofSend", () => {
  beforeEach(() => {
    for (const group of Object.values(prismaMock)) {
      if (typeof group === "function") {
        group.mockReset();
        continue;
      }
      for (const mock of Object.values(group)) {
        mock.mockReset();
      }
    }
    vi.mocked(evaluateSuppression).mockReset();
    vi.mocked(triggerOutboundQueueDrain).mockReset();
    vi.mocked(triggerOutboundQueueDrain).mockResolvedValue(undefined);
    delete process.env.AUTH_URL;
    delete process.env.INTERNAL_APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  it("blocks when the confirmation phrase is missing", async () => {
    const result = await queueSelectedMailboxInternalProofSend(
      validInput({ confirmationPhrase: "" }),
    );

    expect(result.ok).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(triggerOutboundQueueDrain).not.toHaveBeenCalled();
  });

  it("blocks non-allowlisted recipients before any send is queued", async () => {
    const result = await queueSelectedMailboxInternalProofSend(
      validInput({ toEmail: "prospect@example.com" }),
    );

    expect(result.ok).toBe(false);
    expect(prismaMock.client.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(triggerOutboundQueueDrain).not.toHaveBeenCalled();
  });

  it("uses the selected mailbox for the queued outbound row", async () => {
    const selectedMailbox = {
      ...baseMailbox,
      id: "mailbox-2",
      email: "joe@opensdoors.co.uk",
      emailNormalized: "joe@opensdoors.co.uk",
    };
    setupHappyPath(selectedMailbox);

    const result = await queueSelectedMailboxInternalProofSend(
      validInput({ mailboxIdentityId: "mailbox-2" }),
    );

    expect(result.ok).toBe(true);
    const created = prismaMock.outboundEmail.create.mock.calls[0]![0] as {
      data: { mailboxIdentityId: string; fromAddress: string };
    };
    expect(created.data.mailboxIdentityId).toBe("mailbox-2");
    expect(created.data.fromAddress).toBe("joe@opensdoors.co.uk");
  });

  it("consumes exactly one capacity slot for the selected mailbox", async () => {
    setupHappyPath();

    await queueSelectedMailboxInternalProofSend(validInput());

    expect(prismaMock.mailboxSendReservation.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.mailboxSendReservation.create.mock.calls[0]![0]).toMatchObject({
      data: {
        clientId: "client-1",
        mailboxIdentityId: "mailbox-1",
        status: "RESERVED",
      },
    });
    expect(prismaMock.mailboxSendReservation.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.mailboxSendReservation.update.mock.calls[0]![0]).toMatchObject({
      where: { id: "reservation-1" },
      data: { outboundEmailId: "outbound-1" },
    });
  });

  it("appends the selected mailbox signature and unsubscribe footer", async () => {
    setupHappyPath();

    await queueSelectedMailboxInternalProofSend(validInput());

    const created = prismaMock.outboundEmail.create.mock.calls[0]![0] as {
      data: { bodySnapshot: string };
    };
    expect(created.data.bodySnapshot).toContain("Proof body");
    expect(created.data.bodySnapshot).toContain("Adam OpensDoors\nOpensDoors");
    expect(created.data.bodySnapshot).toContain(
      "Unsubscribe: mailto:adam@opensdoors.co.uk?subject=unsubscribe",
    );
  });

  it("stores hosted footer metadata so provider HTML can render a clean unsubscribe anchor", async () => {
    process.env.AUTH_URL = "https://opensdoors.bidlow.co.uk";
    setupHappyPath();

    await queueSelectedMailboxInternalProofSend(validInput());

    const created = prismaMock.outboundEmail.create.mock.calls[0]![0] as {
      data: { bodySnapshot: string; metadata: { headers?: { listUnsubscribe?: string } } };
    };
    const body = created.data.bodySnapshot;
    expect(body.indexOf("Adam OpensDoors")).toBeLessThan(body.indexOf("Unsubscribe:"));
    // H1 — the List-Unsubscribe header points at the POST-capable /api/ path
    // (one-click), while the in-body footer keeps the page path.
    expect(created.data.metadata.headers?.listUnsubscribe).toMatch(
      /^<https:\/\/opensdoors\.bidlow\.co\.uk\/api\/unsubscribe\/.+>$/,
    );
    expect(body).toContain("Unsubscribe: https://opensdoors.bidlow.co.uk/unsubscribe/");
  });

  it("creates audit and activity-visible outbound metadata", async () => {
    setupHappyPath();

    await queueSelectedMailboxInternalProofSend(validInput());

    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.auditLog.create.mock.calls[0]![0]).toMatchObject({
      data: {
        staffUserId: "staff1",
        clientId: "client-1",
        action: "CREATE",
        entityType: "OutboundEmail",
        entityId: "outbound-1",
        metadata: {
          kind: "internalProofSend",
          mailboxIdentityId: "mailbox-1",
          mailboxEmail: "adam@opensdoors.co.uk",
          recipient: "greg@bidlow.co.uk",
          subject: "Proof subject",
        },
      },
    });
    expect(prismaMock.outboundEmail.create.mock.calls[0]![0]).toMatchObject({
      data: {
        metadata: {
          kind: "internalProofSend",
          selectedMailboxIdentityId: "mailbox-1",
          approvedRecipient: "greg@bidlow.co.uk",
        },
      },
    });
  });

  it("does not queue when the selected mailbox has no signature", async () => {
    setupHappyPath({ ...baseMailbox, senderSignatureText: null });

    const result = await queueSelectedMailboxInternalProofSend(validInput());

    expect(result.ok).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(triggerOutboundQueueDrain).not.toHaveBeenCalled();
  });
});
