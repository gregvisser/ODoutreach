import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The dispatcher verifies the recipient's domain can receive mail before
 * sending (see execute-one-address-verification.test.ts, which is where that
 * gate is actually tested). Fake DNS here so this suite is deterministic and
 * needs no network — plain functions rather than vi.fn so a clearAllMocks /
 * resetAllMocks in a beforeEach cannot strip the implementation.
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
const { markConsumed, markReleased, getGoogleToken, sendGmail, evalSupp } = vi.hoisted(() => ({
  markConsumed: vi.fn(),
  markReleased: vi.fn(),
  getGoogleToken: vi.fn(),
  sendGmail: vi.fn(),
  evalSupp: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    outboundEmail: { findUnique, updateMany },
    clientMailboxIdentity: { findFirst: findFirstMbox },
    // Open-tracking pixel reads the client's aligned link domain; null = fall
    // back to the default public base URL (unchanged pixel behaviour here).
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
const { buildRfc } = vi.hoisted(() => ({
  buildRfc: vi.fn(() => "rfc"),
}));
const TEST_MESSAGE_ID = "<test-msg-id@workspace.test>";
vi.mock("@/server/mailbox/gmail-sendmail", () => ({
  buildRfc5322PlainTextEmail: (...a: unknown[]) =>
    (buildRfc as (...args: unknown[]) => string)(...a),
  sendGmailUsersMessagesSend: (...a: unknown[]) =>
    (sendGmail as (...args: unknown[]) => unknown)(...a),
  generateRfc822MessageId: () => TEST_MESSAGE_ID,
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
  subject: "ODoutreach test send — governed mailbox proof",
  bodySnapshot: "x",
  correlationId: "corr-9",
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

describe("executeOutboundSend — Google governed path", () => {
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
    getGoogleToken.mockResolvedValue("access");
    sendGmail.mockResolvedValue({
      ok: true,
      providerMessageId: "gmail:abc123",
      providerName: "google_gmail",
    });
  });

  it("marks reservation CONSUMED after a successful Gmail send", async () => {
    const r = await executeOutboundSend("out1");
    expect(r.ok).toBe(true);
    expect(getGoogleToken).toHaveBeenCalledWith("m1");
    expect(markConsumed).toHaveBeenCalledWith("out1");
    expect(markReleased).not.toHaveBeenCalled();
  });

  it("releases reservation on terminal Gmail failure", async () => {
    sendGmail.mockResolvedValue({ ok: false, error: "nope", code: "403" });
    const r = await executeOutboundSend("out1");
    expect(r.ok).toBe(false);
    expect(markReleased).toHaveBeenCalledWith("out1");
    expect(markConsumed).not.toHaveBeenCalled();
  });

  it("PR N — passes List-Unsubscribe headers to RFC 5322 builder when metadata carries them", async () => {
    findUnique.mockImplementation(
      (q: { where?: { id: string }; select?: { mailboxIdentityId?: true } } | undefined) => {
        if (q && "select" in q && q.select && "mailboxIdentityId" in (q.select ?? {})) {
          return Promise.resolve({ mailboxIdentityId: "m1" });
        }
        return Promise.resolve({
          ...baseRow,
          metadata: {
            kind: "sequenceIntroductionSend",
            headers: {
              listUnsubscribe: "<https://app.example.com/unsubscribe/raw-g>",
              listUnsubscribePost: "List-Unsubscribe=One-Click",
            },
          },
        });
      },
    );
    await executeOutboundSend("out1");
    const rfcCalls = buildRfc.mock.calls as unknown as unknown[][];
    expect(rfcCalls.length).toBeGreaterThan(0);
    const firstArg = rfcCalls[0]![0] as {
      extraHeaders?: Array<{ name: string; value: string }>;
      bodyHtml?: string;
    };
    expect(firstArg.extraHeaders).toEqual([
      { name: "Message-ID", value: TEST_MESSAGE_ID },
      {
        name: "List-Unsubscribe",
        value: "<https://app.example.com/unsubscribe/raw-g>",
      },
      {
        name: "List-Unsubscribe-Post",
        value: "List-Unsubscribe=One-Click",
      },
    ]);
    expect(firstArg.bodyHtml).toContain('<a href="https://app.example.com/unsubscribe/raw-g">Unsubscribe</a>');
    expect(firstArg.bodyHtml).not.toContain("Unsubscribe: https://app.example.com/unsubscribe/raw-g");
  });

  it("PR N — stamps only the Message-ID header when metadata lacks unsubscribe shape", async () => {
    await executeOutboundSend("out1");
    const rfcCalls = buildRfc.mock.calls as unknown as unknown[][];
    expect(rfcCalls.length).toBeGreaterThan(0);
    const firstArg = rfcCalls[0]![0] as {
      extraHeaders?: Array<{ name: string; value: string }>;
    };
    expect(firstArg.extraHeaders).toEqual([
      { name: "Message-ID", value: TEST_MESSAGE_ID },
    ]);
  });
});
