/**
 * PR L — Launch-approval gate behaviour for `sendSequenceStepBatch`.
 *
 * These tests focus on the governance path only: allowlisted recipients
 * continue to pass through to the existing D4e pipeline, and
 * non-allowlisted recipients are blocked BEFORE the outbound transaction
 * with a persisted `blocked_*` reason code. We assert that `$transaction`
 * is never invoked when every candidate is governance-blocked, which is
 * the strongest signal that no `OutboundEmail` row or reservation is
 * created for real-prospect sends.
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

describe("sendSequenceStepBatch — PR L launch-approval gate", () => {
  beforeEach(() => {
    process.env.GOVERNED_TEST_EMAIL_DOMAINS = "bidlow.co.uk";
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

  it("blocks a non-allowlisted recipient and never opens the send transaction", async () => {
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
    expect(result.blocked[0].reason).toMatch(/LIVE_PROSPECT/);

    // BLOCKED status persisted on the row with the governance reason.
    expect(prismaMock.clientEmailSequenceStepSend.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ss-blocked" },
        data: expect.objectContaining({
          status: "BLOCKED",
          blockedReason: expect.stringContaining("blocked_client_inactive"),
        }),
      }),
    );

    // Strongest safety assertion: we never entered the send transaction,
    // which means no OutboundEmail row was created and no mailbox slot
    // was reserved.
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("allows an allowlisted recipient to pass governance and reach the send transaction", async () => {
    mountSequence();
    mountMailboxPool();
    mountClient({ status: "ONBOARDING" });
    mountReadyRow("ada@bidlow.co.uk", "ss-ok");

    // We don't exercise the whole outbound pipeline here — we only
    // assert that governance DID NOT block the row and the code
    // reached `$transaction` (i.e. the recipient was eligible for
    // the existing D4e send flow). Throwing a known tag inside the
    // transaction callback cleanly short-circuits the test without
    // stubbing every reservation helper.
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
    // Governance did not block the row before the transaction, so no
    // BLOCKED update fired.
    expect(
      prismaMock.clientEmailSequenceStepSend.update,
    ).not.toHaveBeenCalled();
  });

  it("blocks ACTIVE + CONTROLLED_INTERNAL non-allowlisted with live_mode_not_enabled", async () => {
    mountSequence();
    mountMailboxPool();
    mountClient({
      status: "ACTIVE",
      launchApprovedAt: new Date("2026-04-22T10:00:00Z"),
      launchApprovalMode: "CONTROLLED_INTERNAL",
    });
    mountReadyRow("prospect@example.com", "ss-live-not-enabled");

    const result = await sendSequenceStepBatch({
      staff,
      clientId: "c1",
      sequenceId: "seq-1",
      category: "INTRODUCTION",
      confirmationPhrase: "SEND INTRODUCTION",
    });

    expect(result.counts.blockedLaunchApproval).toBe(1);
    expect(result.blocked[0].reason).toMatch(
      /\[blocked_live_mode_not_enabled\]/,
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("blocks ACTIVE + LIVE_PROSPECT non-allowlisted with unsubscribe_required (because one-click unsubscribe is not wired)", async () => {
    mountSequence();
    mountMailboxPool();
    mountClient({
      status: "ACTIVE",
      launchApprovedAt: new Date("2026-04-22T10:00:00Z"),
      launchApprovalMode: "LIVE_PROSPECT",
    });
    mountReadyRow("prospect@example.com", "ss-unsub-missing");

    const result = await sendSequenceStepBatch({
      staff,
      clientId: "c1",
      sequenceId: "seq-1",
      category: "INTRODUCTION",
      confirmationPhrase: "SEND INTRODUCTION",
    });

    expect(result.counts.blockedLaunchApproval).toBe(1);
    expect(result.blocked[0].reason).toMatch(
      /\[blocked_unsubscribe_required\]/,
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
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
  };
  // Registering here keeps the describe body declarative.
  (globalThis as unknown as { afterEach?: (fn: () => void) => void })
    .afterEach?.(teardown);
}
