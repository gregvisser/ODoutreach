import { beforeEach, describe, expect, it, vi } from "vitest";

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
  },
}));
vi.mock("@/server/mailbox/sending-policy", () => ({
  humanizeGovernanceRejection: vi.fn((c: string) => c),
  mailboxIneligibleForGovernedSendExecution: vi.fn(
    (m: { connectionStatus: string } | { connectionStatus?: string }) =>
      m.connectionStatus === "DISCONNECTED" ? "mailbox_not_connected" : null,
  ),
  markReservationConsumedForOutbound: (...a: unknown[]) => markConsumed(...a),
  markReservationReleasedForOutbound: (...a: unknown[]) => markReleased(...a),
}));
vi.mock("@/server/mailbox/google-mailbox-access", () => ({
  getGoogleGmailAccessTokenForMailbox: (...a: unknown[]) => getGoogleToken(...a),
}));
const { buildRfc } = vi.hoisted(() => ({
  buildRfc: vi.fn(() => "rfc"),
}));
vi.mock("@/server/mailbox/gmail-sendmail", () => ({
  buildRfc5322PlainTextEmail: (...a: unknown[]) => buildRfc(...a),
  sendGmailUsersMessagesSend: (...a: unknown[]) => sendGmail(...a),
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
    const call = buildRfc.mock.calls[0][0] as {
      extraHeaders?: Array<{ name: string; value: string }>;
    };
    expect(call.extraHeaders).toEqual([
      {
        name: "List-Unsubscribe",
        value: "<https://app.example.com/unsubscribe/raw-g>",
      },
      {
        name: "List-Unsubscribe-Post",
        value: "List-Unsubscribe=One-Click",
      },
    ]);
  });

  it("PR N — passes no extraHeaders when metadata lacks unsubscribe header shape", async () => {
    await executeOutboundSend("out1");
    const call = buildRfc.mock.calls[0][0] as { extraHeaders?: unknown };
    expect(call.extraHeaders).toBeUndefined();
  });
});
