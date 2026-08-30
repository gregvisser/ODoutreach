import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Row 108 — red-first tests for the Gmail post-send Message-ID read-back.
 * See docs/ops/REPLY-MATCHER-LEG1-MEASUREMENT-2026-08-30.md: Gmail rewrites
 * whatever Message-ID we supply, so the value stamped by generateRfc822MessageId
 * has never matched a genuine reply's In-Reply-To. This suite asserts the
 * post-send read-back corrects the stored value, and — separately — that a
 * failing read-back can never affect the recorded send outcome.
 */
vi.mock("node:dns", () => ({
  promises: {
    resolveMx: async () => [{ exchange: "mx.deliverable.test", priority: 10 }],
    resolve4: async () => [],
    resolve6: async () => [],
  },
}));

const { findUnique, updateMany, findFirstMbox } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  findFirstMbox: vi.fn(),
}));
const { markConsumed, markReleased, getGoogleToken, sendGmail, evalSupp, fetchDelivered } =
  vi.hoisted(() => ({
    markConsumed: vi.fn(),
    markReleased: vi.fn(),
    getGoogleToken: vi.fn(),
    sendGmail: vi.fn(),
    evalSupp: vi.fn(),
    fetchDelivered: vi.fn(),
  }));

vi.mock("@/lib/db", () => ({
  prisma: {
    outboundEmail: { findUnique, updateMany },
    clientMailboxIdentity: { findFirst: findFirstMbox },
    client: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}));
vi.mock("@/server/mailbox/sending-policy", () => ({
  humanizeGovernanceRejection: vi.fn((c: string) => c),
  mailboxIneligibleForGovernedSendExecution: vi.fn(
    (m: { connectionStatus: string } | { connectionStatus?: string }) =>
      m.connectionStatus === "DISCONNECTED" ? "mailbox_not_connected" : null,
  ),
  markReservationConsumedForOutbound: (...a: unknown[]) =>
    (markConsumed as (...args: unknown[]) => unknown)(...a),
  markReservationReleasedForOutbound: (...a: unknown[]) =>
    (markReleased as (...args: unknown[]) => unknown)(...a),
}));
vi.mock("@/server/mailbox/google-mailbox-access", () => ({
  getGoogleGmailAccessTokenForMailbox: (...a: unknown[]) => getGoogleToken(...a),
}));
const GENERATED_MESSAGE_ID = "<generated-uuid@workspace.test>";
const DELIVERED_MESSAGE_ID = "<CAKYWrRealDeliveredId@mail.gmail.com>";
vi.mock("@/server/mailbox/gmail-sendmail", () => ({
  buildRfc5322PlainTextEmail: vi.fn(() => "rfc"),
  sendGmailUsersMessagesSend: (...a: unknown[]) => (sendGmail as (...args: unknown[]) => unknown)(...a),
  generateRfc822MessageId: () => GENERATED_MESSAGE_ID,
  fetchDeliveredGmailMessageId: (...a: unknown[]) =>
    (fetchDelivered as (...args: unknown[]) => unknown)(...a),
}));
vi.mock("@/server/outreach/suppression-guard", () => ({
  evaluateSuppression: (...a: unknown[]) => evalSupp(...a),
}));

import { executeOutboundSend } from "./execute-one";

const baseRow = {
  id: "out1",
  clientId: "c1",
  toEmail: "to@bidlow.co.uk",
  toDomain: "bidlow.co.uk",
  status: "PROCESSING" as const,
  providerMessageId: null,
  subject: "Row 108 read-back test",
  bodySnapshot: "x",
  correlationId: "corr-108",
  mailboxIdentityId: "m1",
  fromAddress: "from@workspace.test",
  sendAttempt: 0,
  retryCount: 0,
  providerIdempotencyKey: null,
};

function connectedGoogleMbox(over: Record<string, unknown> = {}) {
  return {
    id: "m1",
    clientId: "c1",
    email: "from@workspace.test",
    emailNormalized: "from@workspace.test",
    provider: "GOOGLE",
    connectionStatus: "CONNECTED" as const,
    isActive: true,
    canSend: true,
    isSendingEnabled: true,
    displayName: null,
    senderDisplayName: null,
    senderSignatureHtml: null,
    senderSignatureText: null,
    senderSignatureSource: null,
    senderSignatureSyncedAt: null,
    senderSignatureSyncError: null,
    workspaceRemovedAt: null,
    ...over,
  };
}

describe("executeOutboundSend — Gmail post-send Message-ID read-back (row 108)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUnique.mockImplementation(
      (q: { where?: { id: string }; select?: { mailboxIdentityId?: true } } | undefined) => {
        if (q && "select" in q && q.select && "mailboxIdentityId" in (q.select ?? {})) {
          return Promise.resolve({ mailboxIdentityId: "m1" });
        }
        return Promise.resolve({ ...baseRow });
      },
    );
    updateMany.mockResolvedValue({ count: 1 });
    findFirstMbox.mockResolvedValue(connectedGoogleMbox());
    evalSupp.mockResolvedValue({ suppressed: false });
    getGoogleToken.mockResolvedValue("access-token-xyz");
    sendGmail.mockResolvedValue({
      ok: true,
      providerMessageId: "gmail:abc123",
      providerName: "google_gmail",
    });
  });

  it("stores the PROVIDER's delivered Message-ID, not the one we generated", async () => {
    fetchDelivered.mockResolvedValue(DELIVERED_MESSAGE_ID);

    const r = await executeOutboundSend("out1");
    expect(r.ok).toBe(true);

    // The read-back must have been asked about the exact message we just sent.
    expect(fetchDelivered).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "access-token-xyz", gmailMessageId: "abc123" }),
    );

    // The LAST write to this row's rfc822MessageId must be the delivered value —
    // not GENERATED_MESSAGE_ID, which is what the send-time write used.
    const rfcWrites = (updateMany.mock.calls as Array<[{ data?: { rfc822MessageId?: string } }]>)
      .map((call) => call[0]?.data?.rfc822MessageId)
      .filter((v): v is string => typeof v === "string");
    expect(rfcWrites.length).toBeGreaterThan(0);
    expect(rfcWrites[rfcWrites.length - 1]).toBe(DELIVERED_MESSAGE_ID);
    expect(rfcWrites[rfcWrites.length - 1]).not.toBe(GENERATED_MESSAGE_ID);
  });

  it("leaves the originally stored value in place when the read-back finds nothing", async () => {
    fetchDelivered.mockResolvedValue(null);

    const r = await executeOutboundSend("out1");
    expect(r.ok).toBe(true);
    expect(fetchDelivered).toHaveBeenCalled();

    const rfcWrites = (updateMany.mock.calls as Array<[{ data?: { rfc822MessageId?: string } }]>)
      .map((call) => call[0]?.data?.rfc822MessageId)
      .filter((v): v is string => typeof v === "string");
    // Only the original send-time write should have set rfc822MessageId.
    expect(rfcWrites).toEqual([GENERATED_MESSAGE_ID]);
  });

  it("THE SAFETY CONTRACT: a throwing read-back never affects the recorded send outcome", async () => {
    fetchDelivered.mockRejectedValue(new Error("Gmail API timed out"));

    // Must not throw out of executeOutboundSend, and the send must still be
    // recorded ok:true — a delivered email is worth more than a matching id.
    const r = await executeOutboundSend("out1");
    expect(r.ok).toBe(true);
    expect(fetchDelivered).toHaveBeenCalled();
    expect(markConsumed).toHaveBeenCalledWith("out1");
    expect(markReleased).not.toHaveBeenCalled();

    // The send-time SENT write with the generated id must have gone through
    // untouched by the read-back's failure.
    const sentWrite = (
      updateMany.mock.calls as Array<[{ data?: { status?: string; rfc822MessageId?: string } }]>
    ).find((call) => call[0]?.data?.status === "SENT");
    expect(sentWrite?.[0]?.data?.rfc822MessageId).toBe(GENERATED_MESSAGE_ID);
  });
});
