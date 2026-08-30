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
    // Warm-up now anchors on days actually sent on, resolved via a raw query
    // (countSendingDaysForPool). Default to "never sent" so these fixtures keep
    // exercising the bottom of the ramp rather than silently skipping it.
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

function mountMailboxPool(email = "sender@bidlow.co.uk") {
  prismaMock.clientMailboxIdentity.findMany.mockResolvedValue([
    {
      id: "m1",
      clientId: "c1",
      email,
      emailNormalized: email,
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

    // A real-prospect send now requires a working one-click unsubscribe.
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

  it("allows ACTIVE non-allowlisted without launch approval once one-click unsubscribe is ready", async () => {
    mountSequence();
    mountMailboxPool();
    mountClient({
      status: "ACTIVE",
      launchApprovedAt: null,
      launchApprovalMode: null,
    });
    mountReadyRow("prospect@example.com", "ss-no-approval");

    // Live sequence sends do not need launch approval — but they DO need a
    // working one-click unsubscribe, so configure the public base URL.
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
  });

  it("BLOCKS a non-allowlisted real-prospect send when NO opt-out rail exists at all", async () => {
    mountSequence();
    // A pool whose only mailbox address cannot receive a mailto opt-out, and
    // (via beforeEach) no AUTH_URL / INTERNAL_APP_URL / NEXT_PUBLIC_APP_URL and
    // no client aligned link domain. There is genuinely no way for this
    // recipient to opt out, so the send must be blocked.
    mountMailboxPool("not-a-valid-address");
    mountClient({
      status: "ACTIVE",
      launchApprovedAt: new Date("2026-04-22T10:00:00Z"),
      launchApprovalMode: "LIVE_PROSPECT",
    });
    mountReadyRow("prospect@example.com", "ss-no-unsub");

    const result = await sendSequenceStepBatch({
      staff,
      clientId: "c1",
      sequenceId: "seq-1",
      category: "INTRODUCTION",
      confirmationPhrase: "SEND INTRODUCTION",
    });

    expect(result.counts.queued).toBe(0);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.clientEmailSequenceStepSend.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ss-no-unsub" },
        data: expect.objectContaining({
          status: "BLOCKED",
          blockedReason: expect.stringContaining("blocked_unsubscribe_required"),
        }),
      }),
    );
  });

  it("ALLOWS a real-prospect send with no app base URL — the mailbox mailto is a working opt-out", async () => {
    mountSequence();
    // Same conditions as the block case above except the mailbox address is
    // usable. Before 2026-08 this was blocked, because the only rail the gate
    // recognised was a hosted link on the OpensDoors app domain - which is
    // exactly the misalignment that caused the quarantine incident. A
    // monitored mailto on the sender's own domain is a genuinely usable
    // opt-out, so the send now proceeds.
    mountMailboxPool();
    mountClient({
      status: "ACTIVE",
      launchApprovedAt: new Date("2026-04-22T10:00:00Z"),
      launchApprovalMode: "LIVE_PROSPECT",
    });
    mountReadyRow("prospect@example.com", "ss-mailto-rail");

    await sendSequenceStepBatch({
      staff,
      clientId: "c1",
      sequenceId: "seq-1",
      category: "INTRODUCTION",
      confirmationPhrase: "SEND INTRODUCTION",
    });

    expect(prismaMock.clientEmailSequenceStepSend.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ss-mailto-rail" },
        data: expect.objectContaining({
          blockedReason: expect.stringContaining("blocked_unsubscribe_required"),
        }),
      }),
    );
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
    // Allowlisted recipient: the mailto placeholder path is legitimate for
    // governed-test/allowlisted sends (real-prospect sends now require a
    // hosted unsubscribe). This still exercises the null-sender fallback.
    mountReadyRow("ada@bidlow.co.uk", "ss-null-sender");

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

  it("names the missing unsubscribe rail instead of the generic re-plan message when composition loses send-readiness at dispatch (row 106)", async () => {
    // Row 99/cycle-107 root cause reproduced: a null Client.defaultSenderEmail
    // means the composed BODY {{unsubscribe_link}} is empty at dispatch time,
    // even though the plan-time classifier's placeholder fallback ("[unsubscribe
    // link — provided at dispatch]") let the row through as READY. The mailbox
    // pool's address is a working mailto rail, so the earlier, coarser
    // governance gate is satisfied and this recipient reaches the real
    // dispatch-time composeSequenceEmail check.
    mountSequence();
    mountMailboxPool();
    prismaMock.client.findUniqueOrThrow.mockResolvedValue({
      id: "c1",
      name: "Acme Corp",
      status: "ONBOARDING",
      defaultSenderEmail: null,
      launchApprovedAt: null,
      launchApprovalMode: null,
      onboarding: {
        formData: { senderCompanyName: "Acme", emailSignature: "Regards,\nAcme" },
      },
    } as never);
    // Allowlisted recipient — governance for this row is not the thing under
    // test; the point is that it clears governance and still gets blocked at
    // composition time.
    mountReadyRow("ada@bidlow.co.uk", "ss-lost-readiness");
    // Pacing is a separate, unrelated gate that also runs inside the real
    // transaction body this test exercises — switch it off so it can't hold
    // the row back before composition is even reached.
    const origPacing = process.env.MAILBOX_SEND_PACING;
    process.env.MAILBOX_SEND_PACING = "false";

    try {
      const stepSendUpdate = vi.fn().mockResolvedValue({});
      prismaMock.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            mailboxSendReservation: {
              count: vi.fn().mockResolvedValue(0),
              findFirst: vi.fn().mockResolvedValue(null),
              create: vi.fn().mockResolvedValue({ id: "resv-1" }),
              update: vi.fn().mockResolvedValue({}),
            },
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
      expect(result.blocked).toHaveLength(1);

      const reason = result.blocked[0].reason;
      // The defect this row exists to fix: the generic message named no cause.
      expect(reason).not.toBe(
        "Composition lost send-readiness between planning and dispatch; re-plan.",
      );
      expect(reason.toLowerCase()).toContain("unsubscribe");
      // Row 99 put the fix exactly here — the message must say so.
      expect(reason).toContain("Mailboxes tab");
      // Operator-facing: never the raw placeholder key.
      expect(reason).not.toContain("{{");

      // The guard itself must still refuse — this row changes the message,
      // never whether the send is allowed.
      expect(stepSendUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "ss-lost-readiness" },
          data: expect.objectContaining({ status: "BLOCKED", blockedReason: reason }),
        }),
      );
    } finally {
      if (origPacing === undefined) delete process.env.MAILBOX_SEND_PACING;
      else process.env.MAILBOX_SEND_PACING = origPacing;
    }
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
