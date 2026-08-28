import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * THE TEST THE BRIEF NAMED:
 *
 *   "a send for Train Hugger is refused, a send for Bidlow is allowed, and a
 *    missing allowlist refuses both."
 *
 * It runs `executeOutboundSend` — the real dispatcher — not the pure guard next
 * door. The brief was explicit that the refusal must happen "at the point of
 * dispatch, not merely discouraged upstream", and the only way to know that is
 * to reach dispatch and check no message was handed to Gmail.
 *
 * Every assertion below therefore ends at `sendGmail`. A test that only checked
 * the returned decision would pass just as happily while the mail went out.
 */

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

const { findUnique, updateMany, findFirstMbox, clientFindUnique } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  findFirstMbox: vi.fn(),
  clientFindUnique: vi.fn(),
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
    client: { findUnique: clientFindUnique },
  },
}));
vi.mock("@/server/mailbox/sending-policy", () => ({
  humanizeGovernanceRejection: vi.fn((c: string) => c),
  mailboxIneligibleForGovernedSendExecution: vi.fn(() => null),
  markReservationConsumedForOutbound: (...a: unknown[]) =>
    (markConsumed as (...args: unknown[]) => unknown)(...a),
  markReservationReleasedForOutbound: (...a: unknown[]) =>
    (markReleased as (...args: unknown[]) => unknown)(...a),
}));
vi.mock("@/server/mailbox/google-mailbox-access", () => ({
  getGoogleGmailAccessTokenForMailbox: (...a: unknown[]) => getGoogleToken(...a),
}));
vi.mock("@/server/mailbox/gmail-sendmail", () => ({
  buildRfc5322PlainTextEmail: vi.fn(() => "rfc"),
  sendGmailUsersMessagesSend: (...a: unknown[]) =>
    (sendGmail as (...args: unknown[]) => unknown)(...a),
  generateRfc822MessageId: () => "<id@workspace.test>",
}));
vi.mock("@/server/outreach/suppression-guard", () => ({
  evaluateSuppression: (...a: unknown[]) => evalSupp(...a),
}));

import { executeOutboundSend } from "./execute-one";

const ROW = {
  id: "out1",
  clientId: "c1",
  toEmail: "prospect@example.com",
  toDomain: "example.com",
  status: "PROCESSING" as const,
  providerMessageId: null,
  subject: "s",
  bodySnapshot: "x",
  correlationId: "corr-1",
  mailboxIdentityId: "m1",
  fromAddress: "from@workspace.test",
  sendAttempt: 0,
  retryCount: 0,
  providerIdempotencyKey: null,
  /** No staff behind it — this is a machine-initiated send. */
  staffUserId: null as string | null,
};

function mailbox() {
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
  };
}

/** Point the dispatcher at a client with this slug. */
function clientIs(slug: string | null) {
  clientFindUnique.mockImplementation(
    (q: { select?: Record<string, unknown> } | undefined) => {
      // The dispatcher reads the client twice for different columns: once for
      // the slug (the gate) and once for the link domain (the pixel).
      if (q?.select && "slug" in q.select) {
        return Promise.resolve(slug === null ? null : { slug });
      }
      return Promise.resolve(null);
    },
  );
}

function setRow(over: Partial<typeof ROW> = {}) {
  findUnique.mockImplementation(
    (q: { select?: { mailboxIdentityId?: true } } | undefined) => {
      if (q?.select && "mailboxIdentityId" in q.select) {
        return Promise.resolve({ mailboxIdentityId: "m1" });
      }
      return Promise.resolve({ ...ROW, ...over });
    },
  );
}

const ENV_KEYS = ["AUTONOMOUS_RELAY_ACTIVE", "AUTONOMOUS_SEND_ALLOWLIST"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  setRow();
  updateMany.mockResolvedValue({ count: 1 });
  findFirstMbox.mockResolvedValue(mailbox());
  evalSupp.mockResolvedValue({ suppressed: false });
  getGoogleToken.mockResolvedValue("access");
  sendGmail.mockResolvedValue({
    ok: true,
    providerMessageId: "pm1",
    providerName: "gmail",
  });
  clientIs("bidlowai");
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("while the autonomous relay is running", () => {
  beforeEach(() => {
    process.env.AUTONOMOUS_RELAY_ACTIVE = "1";
    process.env.AUTONOMOUS_SEND_ALLOWLIST = "bidlowai";
  });

  it("REFUSES a send for Train Hugger, and hands nothing to Gmail", async () => {
    clientIs("train-hugger");

    const result = await executeOutboundSend("out1");

    expect(result.ok).toBe(false);
    // The part that matters. Not "was refused" — "did not send".
    expect(sendGmail).not.toHaveBeenCalled();
    expect(getGoogleToken).not.toHaveBeenCalled();
    expect(result.error).toMatch(/train-hugger/);
  });

  it("ALLOWS a send for Bidlow", async () => {
    clientIs("bidlowai");

    const result = await executeOutboundSend("out1");

    expect(result.ok).toBe(true);
    expect(sendGmail).toHaveBeenCalledTimes(1);
  });

  it("refuses when the client cannot be identified at all", async () => {
    clientIs(null);

    const result = await executeOutboundSend("out1");

    expect(result.ok).toBe(false);
    expect(sendGmail).not.toHaveBeenCalled();
  });

  it("does not block a send a member of staff launched", async () => {
    // "Human-operated use is unaffected." A row carrying a staff user was
    // started by a signed-in person; the gate is aimed at an agent.
    clientIs("train-hugger");
    setRow({ staffUserId: "staff-1" });

    const result = await executeOutboundSend("out1");

    expect(result.ok).toBe(true);
    expect(sendGmail).toHaveBeenCalledTimes(1);
  });

  it("records the refusal on the row, so it is not silent", async () => {
    clientIs("train-hugger");

    await executeOutboundSend("out1");

    const failed = updateMany.mock.calls.find(
      (c) => (c[0] as { data?: { status?: string } })?.data?.status === "FAILED",
    );
    expect(failed).toBeTruthy();
    const data = (failed?.[0] as { data: { lastErrorCode: string; failureReason: string } }).data;
    expect(data.lastErrorCode).toBe("AUTONOMOUS_CLIENT_NOT_ALLOWLISTED");
    expect(data.failureReason).toMatch(/train-hugger/);
  });
});

describe("a missing allowlist refuses BOTH", () => {
  beforeEach(() => {
    process.env.AUTONOMOUS_RELAY_ACTIVE = "1";
    process.env.AUTONOMOUS_SEND_ALLOWLIST = "";
  });

  it("refuses Train Hugger", async () => {
    clientIs("train-hugger");
    const result = await executeOutboundSend("out1");
    expect(result.ok).toBe(false);
    expect(sendGmail).not.toHaveBeenCalled();
  });

  it("refuses Bidlow too — failing closed means everyone", async () => {
    clientIs("bidlowai");
    const result = await executeOutboundSend("out1");
    expect(result.ok).toBe(false);
    expect(sendGmail).not.toHaveBeenCalled();
  });
});

describe("when the relay is NOT running, the gate is inert", () => {
  it("sends for Train Hugger exactly as before", async () => {
    // This is the assertion that stops the safety gate becoming an outage.
    // ODoutreach's real clients must be unaffected when no agent is running.
    delete process.env.AUTONOMOUS_RELAY_ACTIVE;
    clientIs("train-hugger");

    const result = await executeOutboundSend("out1");

    expect(result.ok).toBe(true);
    expect(sendGmail).toHaveBeenCalledTimes(1);
  });

  it("does not even look the client up", async () => {
    // The gate must cost nothing in ordinary operation — not one extra query.
    delete process.env.AUTONOMOUS_RELAY_ACTIVE;
    clientFindUnique.mockClear();

    await executeOutboundSend("out1");

    const slugLookups = clientFindUnique.mock.calls.filter((c) =>
      Boolean((c[0] as { select?: Record<string, unknown> })?.select?.slug),
    );
    expect(slugLookups).toHaveLength(0);
  });
});
