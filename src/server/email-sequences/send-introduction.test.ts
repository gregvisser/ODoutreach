/**
 * Governance gate behaviour for `sendSequenceStepBatch`.
 *
 * For live sequence sends (SEQUENCE_INTRODUCTION / SEQUENCE_FOLLOW_UP),
 * non-allowlisted recipients on an ACTIVE client pass governance and
 * reach the send transaction. Only non-ACTIVE clients are blocked.
 *
 * Allowlisted recipients continue to pass through to the existing D4e
 * pipeline on any client status. We assert `$transaction` is invoked
 * when governance allows the recipient, confirming the row reaches
 * the dispatch path.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StaffUser } from "@/generated/prisma/client";

const { prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    client: { findUniqueOrThrow: vi.fn() },
    clientEmailSequence: { findUnique: vi.fn() },
    clientEmailSequenceStepSend: { findMany: vi.fn(), update: vi.fn() },
    clientMailboxIdentity: { findMany: vi.fn() },
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

import { sendSequenceStepBatch } from "./send-introduction";

const staff = { id: "staff1" } as StaffUser;

const ORIG_ALLOWLIST_ENV = process.env.GOVERNED_TEST_EMAIL_DOMAINS;
const ORIG_AUTH_URL = process.env.AUTH_URL;
const ORIG_INTERNAL_APP_URL = process.env.INTERNAL_APP_URL;
const ORIG_NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL;

function mountSequence(overrides?: Record<string, unknown>) {
  prismaMock.clientEmailSequence.findUnique.mockResolvedValue({
    id: "seq-1",
    clientId: "c1",
    name: "PR L sequence",
    status: "APPROVED",
    contactListId: "list-1",
    steps: [
      {
        id: "step-1",
        sequenceId: "seq-1",
        category: "INTRODUCTION",
        position: 1,
        delayDays: 0,
        templateId: "tpl-1",
        template: {
          id: "tpl-1",
          clientId: "c1",
          status: "APPROVED",
          subject: "Hi {{first_name}}",
          content: "Hello {{first_name}} {{sender_name}}",
        },
      },
    ],
    ...overrides,
  } as never);
}

function mountMailboxPool() {
  prismaMock.clientMailboxIdentity.findMany.mockResolvedValue([
    {
      id: "m1",
      clientId: "c1",
      email: "sender@bidlow.co.uk",
      emailNormalized: "sender@bidlow.co.uk",
      displayName: null,
      provider: "MICROSOFT",
      connectionStatus: "CONNECTED",
      isActive: true,
      isPrimary: true,
      canSend: true,
      canReceive: true,
      dailySendCap: 10,
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
    },
  ] as never);
}

function mountClient(
  overrides: Partial<{
    status: string;
    launchApprovedAt: Date | null;
    launchApprovalMode: string | null;
  }> = {},
) {
  prismaMock.client.findUniqueOrThrow.mockResolvedValue({
    id: "c1",
    name: "Acme Corp",
    status: overrides.status ?? "ONBOARDING",
    defaultSenderEmail: "sender@bidlow.co.uk",
    launchApprovedAt: overrides.launchApprovedAt ?? null,
    launchApprovalMode: overrides.launchApprovalMode ?? null,
    onboarding: {
      formData: {
        senderCompanyName: "Acme",
        emailSignature: "Regards,\nAcme",
      },
    },
  } as never);
}

function mountReadyRow(contactEmail: string, id = "ss-1") {
  prismaMock.clientEmailSequenceStepSend.findMany.mockResolvedValue([
    {
      id,
      status: "READY",
      idempotencyKey: `idem-${id}`,
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
        email: contactEmail,
        fullName: "Ada Lovelace",
        firstName: "Ada",
        lastName: "Lovelace",
        company: "Analytical",
        title: "Partner",
        mobilePhone: null,
        officePhone: null,
        isSuppressed: false,
      },
    },
  ] as never);
}

describe("sendSequenceStepBatch — governance gate", () => {
  beforeEach(() => {
    process.env.GOVERNED_TEST_EMAIL_DOMAINS = "bidlow.co.uk";
    delete process.env.AUTH_URL;
    delete process.env.INTERNAL_APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    prismaMock.client.findUniqueOrThrow.mockReset();
    prismaMock.clientEmailSequence.findUnique.mockReset();
    prismaMock.clientEmailSequenceStepSend.findMany.mockReset();
    prismaMock.clientEmailSequenceStepSend.update.mockReset();
    prismaMock.clientMailboxIdentity.findMany.mockReset();
    prismaMock.mailboxSendReservation.count.mockReset();
    prismaMock.$transaction.mockReset();
    vi.mocked(evaluateSuppression).mockReset();
    vi.mocked(evaluateSuppression).mockResolvedValue({
      suppressed: false,
    } as never);
    prismaMock.mailboxSendReservation.count.mockResolvedValue(0);
    prismaMock.clientEmailSequenceStepSend.update.mockResolvedValue(
      {} as never,
    );
  });

  afterEachRestoreEnv();

  it("blocks a non-allowlisted recipient on an ONBOARDING client", async () => {
    mountSequence();
    mountMailboxPool();
    mountClient({ status: "ONBOARDING" });
    mountReadyRow("prospect@example.com", "ss-blocked");

    const result = await sendSequenceStepBatch({
      staff,
      clientId: "c1",
      sequenceId: "seq-1",
      category: "INTRODUCTION",
      confirmationPhrase: "SEND INTRODUCTION",
    });

    expect(result.counts.queued).toBe(0);
    expect(result.counts.blockedLaunchApproval).toBe(1);
    expect(result.blocked).toHaveLength(1);
    expect(result.blocked[0].reason).toMatch(
      /\[blocked_client_inactive\]/,
    );

    expect(prismaMock.clientEmailSequenceStepSend.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ss-blocked" },
        data: expect.objectContaining({
          status: "BLOCKED",
          blockedReason: expect.stringContaining("blocked_client_inactive"),
        }),
      }),
    );

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("allows an allowlisted recipient to pass governance and reach the send transaction", async () => {
    mountSequence();
    mountMailboxPool();
    mountClient({ status: "ONBOARDING" });
    mountReadyRow("ada@bidlow.co.uk", "ss-ok");

    prismaMock.$transaction.mockImplementation(async () => {
      throw new Error("reached-transaction");
    });

    await expect(
      sendSequenceStepBatch({
        staff,
        clientId: "c1",
        sequenceId: "seq-1",
        category: "INTRODUCTION",
        confirmationPhrase: "SEND INTRODUCTION",
      }),
    ).rejects.toThrow(/reached-transaction/);

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(
      prismaMock.clientEmailSequenceStepSend.update,
    ).not.toHaveBeenCalled();
  });

  it("allows ACTIVE + CONTROLLED_INTERNAL non-allowlisted to reach the send transaction", async () => {
    mountSequence();
    mountMailboxPool();
    mountClient({
      status: "ACTIVE",
      launchApprovedAt: new Date("2026-04-22T10:00:00Z"),
      launchApprovalMode: "CONTROLLED_INTERNAL",
    });
    mountReadyRow("prospect@example.com", "ss-live-ok");

    prismaMock.$transaction.mockImplementation(async () => {
      throw new Error("reached-transaction");
    });

    await expect(
      sendSequenceStepBatch({
        staff,
        clientId: "c1",
        sequenceId: "seq-1",
        category: "INTRODUCTION",
        confirmationPhrase: "SEND INTRODUCTION",
      }),
    ).rejects.toThrow(/reached-transaction/);

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(
      prismaMock.clientEmailSequenceStepSend.update,
    ).not.toHaveBeenCalled();
  });

  it("allows ACTIVE non-allowlisted even without launch approval or one-click unsubscribe", async () => {
    mountSequence();
    mountMailboxPool();
    mountClient({
      status: "ACTIVE",
      launchApprovedAt: null,
      launchApprovalMode: null,
    });
    mountReadyRow("prospect@example.com", "ss-no-approval");

    prismaMock.$transaction.mockImplementation(async () => {
      throw new Error("reached-transaction");
    });

    await expect(
      sendSequenceStepBatch({
        staff,
        clientId: "c1",
        sequenceId: "seq-1",
        category: "INTRODUCTION",
        confirmationPhrase: "SEND INTRODUCTION",
      }),
    ).rejects.toThrow(/reached-transaction/);

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it("reaches the send transaction for allowlisted recipient on ACTIVE + LIVE_PROSPECT client", async () => {
    mountSequence();
    mountMailboxPool();
    mountClient({
      status: "ACTIVE",
      launchApprovedAt: new Date("2026-04-22T10:00:00Z"),
      launchApprovalMode: "LIVE_PROSPECT",
    });
    mountReadyRow("ada@bidlow.co.uk", "ss-live-prospect-ready");

    process.env.AUTH_URL = "https://outreach.example.com";

    prismaMock.$transaction.mockImplementation(async () => {
      throw new Error("reached-transaction");
    });

    await expect(
      sendSequenceStepBatch({
        staff,
        clientId: "c1",
        sequenceId: "seq-1",
        category: "INTRODUCTION",
        confirmationPhrase: "SEND INTRODUCTION",
      }),
    ).rejects.toThrow(/reached-transaction/);

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(
      prismaMock.clientEmailSequenceStepSend.update,
    ).not.toHaveBeenCalled();
  });

  it("reaches the send transaction when defaultSenderEmail is null (placeholder fallbacks)", async () => {
    mountSequence();
    mountMailboxPool();
    prismaMock.client.findUniqueOrThrow.mockResolvedValue({
      id: "c1",
      name: "Acme Corp",
      status: "ACTIVE",
      defaultSenderEmail: null,
      launchApprovedAt: null,
      launchApprovalMode: null,
      onboarding: {
        formData: {
          senderCompanyName: "Acme",
          emailSignature: "Regards,\nAcme",
        },
      },
    } as never);
    mountReadyRow("prospect@example.com", "ss-null-sender");

    prismaMock.$transaction.mockImplementation(async () => {
      throw new Error("reached-transaction");
    });

    await expect(
      sendSequenceStepBatch({
        staff,
        clientId: "c1",
        sequenceId: "seq-1",
        category: "INTRODUCTION",
        confirmationPhrase: "SEND INTRODUCTION",
      }),
    ).rejects.toThrow(/reached-transaction/);

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(
      prismaMock.clientEmailSequenceStepSend.update,
    ).not.toHaveBeenCalled();
  });
});

function afterEachRestoreEnv(): void {
  // Restore env after each test. Not a beforeEach because beforeEach
  // already sets a known value; we only need teardown.
  const teardown = () => {
    if (ORIG_ALLOWLIST_ENV === undefined) {
      delete process.env.GOVERNED_TEST_EMAIL_DOMAINS;
    } else {
      process.env.GOVERNED_TEST_EMAIL_DOMAINS = ORIG_ALLOWLIST_ENV;
    }
    for (const [k, v] of [
      ["AUTH_URL", ORIG_AUTH_URL],
      ["INTERNAL_APP_URL", ORIG_INTERNAL_APP_URL],
      ["NEXT_PUBLIC_APP_URL", ORIG_NEXT_PUBLIC_APP_URL],
    ] as const) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  };
  // Registering here keeps the describe body declarative.
  (globalThis as unknown as { afterEach?: (fn: () => void) => void })
    .afterEach?.(teardown);
}
