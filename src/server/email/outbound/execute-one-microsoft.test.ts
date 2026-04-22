import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique, updateMany, findFirstMbox } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  findFirstMbox: vi.fn(),
}));
const { markConsumed, markReleased, getToken, sendGraph, evalSupp } = vi.hoisted(() => ({
  markConsumed: vi.fn(),
  markReleased: vi.fn(),
  getToken: vi.fn(),
  sendGraph: vi.fn(),
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
vi.mock("@/server/mailbox/microsoft-mailbox-access", () => ({
  getMicrosoftGraphAccessTokenForMailbox: (...a: unknown[]) => getToken(...a),
}));
vi.mock("@/server/mailbox/microsoft-graph-sendmail", () => ({
  sendMicrosoftGraphSendMail: (...a: unknown[]) => sendGraph(...a),
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

  it("PR N — omits Graph options entirely when metadata has no unsubscribe headers", async () => {
    await executeOutboundSend("out1");
    const call = sendGraph.mock.calls[0][0] as { options?: unknown };
    expect(call.options).toBeUndefined();
  });
});
