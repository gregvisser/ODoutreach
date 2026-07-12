import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique, updateMany, findFirstMbox, updateManyMbox } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  findFirstMbox: vi.fn(),
  updateManyMbox: vi.fn(),
}));
const { markConsumed, markReleased, getToken, sendGraph, evalSupp } = vi.hoisted(() => ({
  markConsumed: vi.fn(),
  markReleased: vi.fn(),
  getToken: vi.fn(),
  sendGraph: vi.fn(),
  evalSupp: vi.fn(),
}));

vi.mock("@/server/mailbox/mailbox-primary-consistency", () => ({
  reconcilePrimaryMailboxForClient: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
      fn({
        clientMailboxIdentity: {
          updateMany: updateManyMbox,
        },
      }),
    ),
    outboundEmail: { findUnique, updateMany },
    clientMailboxIdentity: { findFirst: findFirstMbox, updateMany: updateManyMbox },
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
  markReservationConsumedForOutbound: (...a: unknown[]) => markConsumed(...a),
  markReservationReleasedForOutbound: (...a: unknown[]) => markReleased(...a),
}));
vi.mock("@/server/mailbox/microsoft-mailbox-access", () => ({
  getMicrosoftGraphAccessTokenForMailbox: (...a: unknown[]) => getToken(...a),
}));
vi.mock("@/server/mailbox/microsoft-graph-sendmail", () => ({
  sendMicrosoftGraphSendMail: (...a: unknown[]) => sendGraph(...a),
  // MIME send is behind a default-off flag; these tests exercise the JSON path.
  isMicrosoftMimeSendEnabled: () => false,
  sendMicrosoftGraphMimeSendMail: (...a: unknown[]) => sendGraph(...a),
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
  fromAddress: "from@bidlow.co.uk",
  sendAttempt: 0,
  retryCount: 0,
  providerIdempotencyKey: null,
};

function connectedMbox(over: Record<string, unknown> = {}) {
  return {
    id: "m1",
    clientId: "c1",
    email: "from@bidlow.co.uk",
    emailNormalized: "from@bidlow.co.uk",
    provider: "MICROSOFT",
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

describe("executeOutboundSend — Microsoft governed path", () => {
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
    updateManyMbox.mockResolvedValue({ count: 1 });
    findFirstMbox.mockResolvedValue(connectedMbox());
    evalSupp.mockResolvedValue({ suppressed: false });
    getToken.mockResolvedValue("access");
    sendGraph.mockResolvedValue({
      ok: true,
      providerMessageId: "msgraph:sendmail:corr-9",
      providerName: "microsoft_graph",
    });
  });

  it("marks reservation CONSUMED after a successful Graph send", async () => {
    const r = await executeOutboundSend("out1");
    expect(r.ok).toBe(true);
    expect(getToken).toHaveBeenCalledWith("m1");
    expect(markConsumed).toHaveBeenCalledWith("out1");
    expect(markReleased).not.toHaveBeenCalled();
  });

  it("releases reservation on terminal Graph failure", async () => {
    sendGraph.mockResolvedValue({ ok: false, error: "nope", code: "403" });
    const r = await executeOutboundSend("out1");
    expect(r.ok).toBe(false);
    expect(markReleased).toHaveBeenCalledWith("out1");
    expect(markConsumed).not.toHaveBeenCalled();
  });

  it("fails and releases when mailbox is disconnected (pre-send)", async () => {
    findFirstMbox.mockResolvedValue(connectedMbox({ connectionStatus: "DISCONNECTED" as const }));
    const r = await executeOutboundSend("out1");
    expect(r.ok).toBe(false);
    expect(sendGraph).not.toHaveBeenCalled();
    expect(markReleased).toHaveBeenCalled();
  });

  it("PR N — passes listUnsubscribeUrl to Graph when metadata carries canonical headers", async () => {
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
              listUnsubscribe: "<https://app.example.com/unsubscribe/raw-x>",
              listUnsubscribePost: "List-Unsubscribe=One-Click",
            },
          },
        });
      },
    );
    await executeOutboundSend("out1");
    const call = sendGraph.mock.calls[0][0] as {
      options?: { listUnsubscribeUrl?: string };
    };
    expect(call.options?.listUnsubscribeUrl).toBe(
      "https://app.example.com/unsubscribe/raw-x",
    );
  });

  it("passes clean HTML body even when metadata has no unsubscribe headers", async () => {
    await executeOutboundSend("out1");
    const call = sendGraph.mock.calls[0][0] as { options?: { bodyHtml?: string } };
    expect(call.options?.bodyHtml).toBe("<p>x</p>");
  });

  it("marks Microsoft MFA refresh failures as mailbox reconnect needed and releases capacity", async () => {
    getToken.mockRejectedValue(
      new Error(
        "Microsoft token refresh failed: invalid_grant — AADSTS50076: Due to a configuration change, use multi-factor authentication",
      ),
    );

    const r = await executeOutboundSend("out1");

    expect(r.ok).toBe(false);
    expect(updateManyMbox).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: {
        connectionStatus: "CONNECTION_ERROR",
        lastError: expect.stringContaining(
          "Microsoft requires this mailbox to re-authenticate. Reconnect this mailbox and complete MFA.",
        ),
      },
    });
    expect(markReleased).toHaveBeenCalledWith("out1");
    expect(markConsumed).not.toHaveBeenCalled();
  });
});
