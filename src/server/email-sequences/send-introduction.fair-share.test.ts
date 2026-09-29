/**
 * Proves mailbox fair-share runs inside the dispatcher, not only in the helper.
 * Pacing is off so a hold can only come from the share gate.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StaffUser } from "@/generated/prisma/client";
import { FAIR_SHARE_HOLD_REASON } from "@/lib/clients/outreach-sequence-send-staff-copy";

const { prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    client: { findUniqueOrThrow: vi.fn() },
    clientSendingCalendar: { findMany: async () => [] },
    clientEmailSequence: { findUnique: vi.fn(), findMany: vi.fn() },
    clientEmailSequenceStepSend: { findMany: vi.fn(), update: vi.fn(), groupBy: vi.fn() },
    clientMailboxIdentity: { findMany: vi.fn() },
    outboundEmail: { findMany: vi.fn() },
    $queryRaw: vi.fn(async () => []),
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
vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

import { evaluateSuppression } from "@/server/outreach/suppression-guard";
import { sendSequenceStepBatch } from "./send-introduction";

const staff = { id: "staff1" } as StaffUser;
const RECIPIENT = "ada@bidlow.co.uk";

function mountReadyLaunch() {
  prismaMock.clientEmailSequence.findUnique.mockResolvedValue({
    id: "seq-1",
    clientId: "c1",
    name: "Jack sequence",
    status: "APPROVED",
    contactListId: "list-1",
    launchPreferredMailboxId: "m-jack",
    steps: [{
      id: "step-1",
      sequenceId: "seq-1",
      category: "INTRODUCTION",
      position: 1,
      delayDays: 0,
      delayHours: 0,
      templateId: "tpl-1",
      template: {
        id: "tpl-1",
        clientId: "c1",
        status: "APPROVED",
        subject: "Hi {{first_name}}",
        content: "Hello {{first_name}} {{sender_name}}",
      },
    }],
  } as never);
  prismaMock.client.findUniqueOrThrow.mockResolvedValue({
    id: "c1",
    name: "Morson FM",
    status: "ONBOARDING",
    defaultSenderEmail: "sender@bidlow.co.uk",
    launchApprovedAt: null,
    launchApprovalMode: null,
    outreachLinkDomain: null,
    outreachLinkDomainVerifiedAt: null,
    sendBatchSize: 4,
    accountGrade: null,
    autonomousSendEnabled: false,
    onboarding: { formData: { senderCompanyName: "Bidlow", emailSignature: "Regards" } },
  } as never);
  prismaMock.clientMailboxIdentity.findMany.mockResolvedValue([{
    id: "m-jack",
    clientId: "c1",
    email: "jack@bidlow.co.uk",
    emailNormalized: "jack@bidlow.co.uk",
    displayName: "Jack",
    provider: "MICROSOFT",
    connectionStatus: "CONNECTED",
    isActive: true,
    isPrimary: true,
    canSend: true,
    canReceive: true,
    dailySendCap: 30,
    isSendingEnabled: true,
    emailsSentToday: 0,
    dailyWindowResetAt: null,
    lastSyncAt: null,
    lastError: null,
    oauthState: null,
    oauthStateExpiresAt: null,
    providerLinkedUserId: null,
    connectedAt: new Date("2026-01-01T00:00:00Z"),
    createdByStaffUserId: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  }] as never);
  prismaMock.clientEmailSequenceStepSend.findMany.mockResolvedValue([{
    id: "ss-jack",
    status: "READY",
    idempotencyKey: "idem-ss-jack",
    outboundEmailId: null,
    enrollmentId: "enr-1",
    contactId: "ct-1",
    enrollment: {
      id: "enr-1",
      clientId: "c1",
      sequenceId: "seq-1",
      contactId: "ct-1",
      status: "PENDING",
      currentStepPosition: 0,
    },
    contact: {
      id: "ct-1",
      clientId: "c1",
      email: RECIPIENT,
      fullName: "Ada Lovelace",
      firstName: "Ada",
      lastName: "Lovelace",
      company: "Analytical",
      title: "Partner",
      mobilePhone: null,
      officePhone: null,
      isSuppressed: false,
    },
  }] as never);
  prismaMock.clientEmailSequence.findMany.mockResolvedValue([
    { id: "seq-1", launchPreferredMailboxId: "m-jack" },
    { id: "seq-older", launchPreferredMailboxId: "m-jack" },
  ] as never);
  prismaMock.clientEmailSequenceStepSend.groupBy.mockResolvedValue([
    { sequenceId: "seq-1", _count: { _all: 1 } },
    { sequenceId: "seq-older", _count: { _all: 4 } },
  ] as never);
}

describe("mailbox fair share inside the dispatcher", () => {
  beforeEach(() => {
    process.env.MAILBOX_SEND_PACING = "false";
    process.env.GOVERNED_TEST_EMAIL_DOMAINS = "bidlow.co.uk";
    delete process.env.AUTH_URL;
    delete process.env.INTERNAL_APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    prismaMock.mailboxSendReservation.count.mockResolvedValue(0);
    prismaMock.outboundEmail.findMany.mockResolvedValue([]);
    vi.mocked(evaluateSuppression).mockResolvedValue({ suppressed: false } as never);
    mountReadyLaunch();
  });

  afterEach(() => {
    delete process.env.MAILBOX_SEND_PACING;
    delete process.env.GOVERNED_TEST_EMAIL_DOMAINS;
  });

  it("holds this launch when an earlier sequence on the same mailbox is still waiting and behind", async () => {
    prismaMock.outboundEmail.findMany.mockResolvedValue(
      Array.from({ length: 4 }, () => ({
        mailboxIdentityId: "m-jack",
        metadata: { sequenceId: "seq-1" },
      })) as never,
    );
    const stepSendUpdate = vi.fn().mockResolvedValue({});
    prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        mailboxSendReservation: { count: vi.fn().mockResolvedValue(0) },
        clientEmailSequenceStepSend: { update: stepSendUpdate },
      }),
    );

    const result = await sendSequenceStepBatch({
      staff,
      clientId: "c1",
      sequenceId: "seq-1",
      category: "INTRODUCTION",
      confirmationPhrase: "SEND INTRODUCTION",
    });

    expect(result.counts.queued).toBe(0);
    expect(result.blocked[0]?.reason).toBe(FAIR_SHARE_HOLD_REASON);
    expect(stepSendUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ss-jack" },
        data: { blockedReason: FAIR_SHARE_HOLD_REASON },
      }),
    );
    expect(stepSendUpdate.mock.calls[0]?.[0].data).not.toHaveProperty("status");
  });

  it("lets the sequence that is behind use the mailbox the earlier sequence already used", async () => {
    prismaMock.outboundEmail.findMany.mockResolvedValue(
      Array.from({ length: 4 }, () => ({
        mailboxIdentityId: "m-jack",
        metadata: { sequenceId: "seq-older" },
      })) as never,
    );
    const mailbox = {
      id: "m-jack",
      clientId: "c1",
      email: "jack@bidlow.co.uk",
      dailySendCap: 30,
      isActive: true,
      isSendingEnabled: true,
      canSend: true,
      connectionStatus: "CONNECTED",
      emailsSentToday: 0,
      dailyWindowResetAt: null,
    };
    prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        $queryRaw: vi.fn().mockResolvedValue([{ id: "m-jack" }]),
        clientSendingCalendar: { findMany: vi.fn().mockResolvedValue([]) },
        clientMailboxIdentity: { findFirst: vi.fn().mockResolvedValue(mailbox) },
        mailboxSendReservation: {
          count: vi.fn().mockResolvedValue(0),
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockRejectedValue(new Error("reached-placement")),
        },
        clientEmailSequenceStepSend: { update: vi.fn().mockResolvedValue({}) },
      }),
    );

    await expect(
      sendSequenceStepBatch({
        staff,
        clientId: "c1",
        sequenceId: "seq-1",
        category: "INTRODUCTION",
        confirmationPhrase: "SEND INTRODUCTION",
      }),
    ).rejects.toThrow(/reached-placement/);
  });
});
