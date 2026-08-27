/**
 * PROOF THAT SEND PACING ACTUALLY FIRES IN THE DISPATCHER.
 *
 * `send-pacing.ts` had seventeen passing unit tests and had never run once in
 * production: the flag that gated it was never set, and no test anywhere
 * asserted that `sendSequenceStepBatch` — the thing that actually sends the
 * client's mail — called it at all. This project has recorded six separate
 * instances of something built, wired, reported as done, and never fired. A
 * green unit test on a helper is not evidence that the helper is in the path.
 *
 * So these tests drive the REAL dispatcher, with the REAL pacing module, and
 * assert an outcome that ONLY pacing can produce: the same fixture, at the same
 * instant, queues nothing with pacing on and reaches the send transaction with
 * pacing off. The difference between the two runs is the gate firing.
 *
 * Nothing here sends. The transaction is mocked and no transport is reachable.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StaffUser } from "@/generated/prisma/client";

const { prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    client: { findUniqueOrThrow: vi.fn() },
    clientEmailSequence: { findUnique: vi.fn() },
    clientEmailSequenceStepSend: { findMany: vi.fn(), update: vi.fn() },
    clientMailboxIdentity: { findMany: vi.fn() },
    // Warm-up anchors on days actually sent on. Empty = never sent.
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

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

import { pacedAllowanceForMailbox } from "@/lib/mailboxes/send-pacing";
import { evaluateSuppression } from "@/server/outreach/suppression-guard";

import { sendSequenceStepBatch } from "./send-introduction";

const staff = { id: "staff1" } as StaffUser;

/**
 * 06:30 UTC — half an hour before the pacing window opens, so no batch is due
 * yet and a paced mailbox is allowed exactly nothing. Deliberately NOT a time
 * the production cron runs (07:00–18:55); this is about isolating the gate.
 */
const BEFORE_FIRST_BATCH = new Date("2026-09-01T06:30:00Z");

/** The recipient is on bidlow.co.uk — the only domain this repo may ever mail. */
const RECIPIENT = "ada@bidlow.co.uk";

function mountSequence() {
  prismaMock.clientEmailSequence.findUnique.mockResolvedValue({
    id: "seq-1",
    clientId: "c1",
    name: "Pacing fixture",
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
    },
  ] as never);
}

function mountClient(sendBatchSize: number | null) {
  prismaMock.client.findUniqueOrThrow.mockResolvedValue({
    id: "c1",
    name: "Bidlow AI",
    status: "ONBOARDING",
    defaultSenderEmail: "sender@bidlow.co.uk",
    launchApprovedAt: null,
    launchApprovalMode: null,
    outreachLinkDomain: null,
    outreachLinkDomainVerifiedAt: null,
    sendBatchSize,
    onboarding: {
      formData: {
        senderCompanyName: "Bidlow",
        emailSignature: "Regards,\nBidlow",
      },
    },
  } as never);
}

function mountReadyRow() {
  prismaMock.clientEmailSequenceStepSend.findMany.mockResolvedValue([
    {
      id: "ss-pacing",
      status: "READY",
      idempotencyKey: "idem-ss-pacing",
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
    },
  ] as never);
}

/**
 * Run the transaction body for real against a stub, so the pacing loop inside it
 * actually executes. The recipient loop that follows it needs nothing beyond the
 * step-send update, because a paced-out mailbox never reaches a reservation.
 */
function runTransactionForReal() {
  prismaMock.$transaction.mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        mailboxSendReservation: { count: vi.fn().mockResolvedValue(0) },
        clientEmailSequenceStepSend: { update: vi.fn().mockResolvedValue({}) },
      }),
  );
}

function dispatch() {
  return sendSequenceStepBatch({
    staff,
    clientId: "c1",
    sequenceId: "seq-1",
    category: "INTRODUCTION",
    confirmationPhrase: "SEND INTRODUCTION",
  });
}

const ORIGINAL_PACING = process.env.MAILBOX_SEND_PACING;
const ORIGINAL_ALLOWLIST = process.env.GOVERNED_TEST_EMAIL_DOMAINS;

describe("send pacing fires inside the real dispatcher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(BEFORE_FIRST_BATCH);
    process.env.GOVERNED_TEST_EMAIL_DOMAINS = "bidlow.co.uk";
    delete process.env.AUTH_URL;
    delete process.env.INTERNAL_APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;

    for (const m of [
      prismaMock.client.findUniqueOrThrow,
      prismaMock.clientEmailSequence.findUnique,
      prismaMock.clientEmailSequenceStepSend.findMany,
      prismaMock.clientEmailSequenceStepSend.update,
      prismaMock.clientMailboxIdentity.findMany,
      prismaMock.mailboxSendReservation.count,
      prismaMock.$transaction,
    ]) {
      m.mockReset();
    }
    prismaMock.mailboxSendReservation.count.mockResolvedValue(0);
    prismaMock.clientEmailSequenceStepSend.update.mockResolvedValue({} as never);
    vi.mocked(evaluateSuppression).mockReset();
    vi.mocked(evaluateSuppression).mockResolvedValue({ suppressed: false } as never);

    mountSequence();
    mountMailboxPool();
    mountReadyRow();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (ORIGINAL_PACING === undefined) delete process.env.MAILBOX_SEND_PACING;
    else process.env.MAILBOX_SEND_PACING = ORIGINAL_PACING;
    if (ORIGINAL_ALLOWLIST === undefined) {
      delete process.env.GOVERNED_TEST_EMAIL_DOMAINS;
    } else {
      process.env.GOVERNED_TEST_EMAIL_DOMAINS = ORIGINAL_ALLOWLIST;
    }
  });

  it("holds the send back when no batch is due yet", async () => {
    delete process.env.MAILBOX_SEND_PACING; // unset must mean ON
    mountClient(4);
    runTransactionForReal();

    const result = await dispatch();

    expect(result.counts.queued).toBe(0);
    expect(result.blocked).toHaveLength(1);
    expect(result.blocked[0].reason).toMatch(/held back by send pacing/i);
    expect(result.blocked[0].contactEmail).toBe(RECIPIENT);
  });

  it("the SAME fixture reaches the send transaction with pacing switched off", async () => {
    // This is the control. Without it, the assertion above could be produced by
    // any of a dozen unrelated blocks and would prove nothing about pacing.
    process.env.MAILBOX_SEND_PACING = "false";
    mountClient(4);
    prismaMock.$transaction.mockImplementation(async () => {
      throw new Error("reached-transaction");
    });

    await expect(dispatch()).rejects.toThrow(/reached-transaction/);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it("carries THIS client's configured batch size into the gate", async () => {
    // The batch size is per-client, so proving the gate fires is not enough —
    // the client's own number has to be the one that reaches it.
    delete process.env.MAILBOX_SEND_PACING;
    mountClient(6);
    runTransactionForReal();

    const spy = vi.fn(pacedAllowanceForMailbox);
    const mod = await import("@/lib/mailboxes/send-pacing");
    const restore = vi.spyOn(mod, "pacedAllowanceForMailbox");
    restore.mockImplementation(spy);

    await dispatch();

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ mailboxId: "m1", batchSize: 6 }),
    );
    restore.mockRestore();
  });

  it("a client with no batch size set still reaches the gate", async () => {
    delete process.env.MAILBOX_SEND_PACING;
    mountClient(null);
    runTransactionForReal();

    const result = await dispatch();

    expect(result.counts.queued).toBe(0);
    expect(result.blocked[0].reason).toMatch(/held back by send pacing/i);
  });
});
