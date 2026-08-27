import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ASSUME THE SEVENTH EXISTS.
 *
 * QUEUE.md records six occasions this week where something was built, wired,
 * reported success and never actually fired. This file is the answer to that
 * for the recipient-verification gate, and it is deliberately built like
 * `execute-one-autonomous-gate.test.ts`: it runs `executeOutboundSend` — the
 * REAL dispatcher — and every assertion ends at `sendGmail`.
 *
 * Only `node:dns` is faked. The policy module, the lookup module, the cache and
 * the dispatcher wiring all execute for real, so a test passing here means the
 * production path blocks, not that a mock returned the answer I wanted.
 *
 * A test that asserted on the returned decision alone would pass just as
 * happily while the mail went out. These assert that nothing was handed to
 * Gmail.
 */

const { resolveMx, resolve4, resolve6 } = vi.hoisted(() => ({
  resolveMx: vi.fn(),
  resolve4: vi.fn(),
  resolve6: vi.fn(),
}));

vi.mock("node:dns", () => ({
  promises: { resolveMx, resolve4, resolve6 },
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
  stableRfc822MessageId: () => "<stable@workspace.test>",
  findGmailMessageIdByRfc822MessageId: vi.fn(),
}));
vi.mock("@/server/outreach/suppression-guard", () => ({
  evaluateSuppression: (...a: unknown[]) => evalSupp(...a),
}));

import { executeOutboundSend } from "./execute-one";
import { clearMailRouteCache } from "@/server/outreach/recipient-mail-route";

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
  staffUserId: "staff-1",
  metadata: null,
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

function dnsError(code: string): Error & { code: string } {
  return Object.assign(new Error(`query ${code}`), { code });
}

/** The domain is fine and has an MX record. */
function domainIsGood() {
  resolveMx.mockResolvedValue([{ exchange: "mx.example.com", priority: 10 }]);
}
/** Nothing resolves at all — the domain does not exist. */
function domainDoesNotExist() {
  resolveMx.mockRejectedValue(dnsError("ENOTFOUND"));
  resolve4.mockRejectedValue(dnsError("ENOTFOUND"));
  resolve6.mockRejectedValue(dnsError("ENOTFOUND"));
}
/** The domain resolves but publishes nowhere for mail to go. */
function domainAcceptsNoMail() {
  resolveMx.mockRejectedValue(dnsError("ENODATA"));
  resolve4.mockRejectedValue(dnsError("ENODATA"));
  resolve6.mockRejectedValue(dnsError("ENODATA"));
}
/** The resolver itself is broken. Says nothing about the recipient. */
function dnsIsBroken() {
  resolveMx.mockRejectedValue(dnsError("ESERVFAIL"));
}

function failedWrite() {
  return updateMany.mock.calls.find(
    (c) => (c[0] as { data?: { status?: string } })?.data?.status === "FAILED",
  )?.[0] as { data: { lastErrorCode: string; failureReason: string } } | undefined;
}

const saved = process.env.RECIPIENT_VERIFICATION_ENABLED;

beforeEach(() => {
  vi.clearAllMocks();
  clearMailRouteCache();
  delete process.env.RECIPIENT_VERIFICATION_ENABLED;
  setRow();
  updateMany.mockResolvedValue({ count: 1 });
  findFirstMbox.mockResolvedValue(mailbox());
  clientFindUnique.mockResolvedValue(null);
  evalSupp.mockResolvedValue({ suppressed: false });
  getGoogleToken.mockResolvedValue("access");
  sendGmail.mockResolvedValue({
    ok: true,
    providerMessageId: "pm1",
    providerName: "gmail",
  });
  domainIsGood();
});

afterEach(() => {
  if (saved === undefined) delete process.env.RECIPIENT_VERIFICATION_ENABLED;
  else process.env.RECIPIENT_VERIFICATION_ENABLED = saved;
});

describe("the gate fires on the real dispatcher", () => {
  it("REFUSES a typo'd domain, and hands nothing to Gmail", async () => {
    setRow({ toEmail: "someone@gmial.com", toDomain: "gmial.com" });
    domainDoesNotExist();

    const result = await executeOutboundSend("out1");

    expect(result.ok).toBe(false);
    // The part that matters. Not "was refused" — "did not send".
    expect(sendGmail).not.toHaveBeenCalled();
    expect(getGoogleToken).not.toHaveBeenCalled();
  });

  it("REFUSES a domain that accepts no mail, and hands nothing to Gmail", async () => {
    setRow({ toEmail: "someone@parked.example", toDomain: "parked.example" });
    domainAcceptsNoMail();

    const result = await executeOutboundSend("out1");

    expect(result.ok).toBe(false);
    expect(sendGmail).not.toHaveBeenCalled();
  });

  it("REFUSES a malformed address without even asking DNS", async () => {
    setRow({ toEmail: "not an address", toDomain: null as unknown as string });

    const result = await executeOutboundSend("out1");

    expect(result.ok).toBe(false);
    expect(sendGmail).not.toHaveBeenCalled();
    expect(resolveMx).not.toHaveBeenCalled();
  });

  it("records WHY on the row, so the refusal is not silent", async () => {
    setRow({ toEmail: "someone@gmial.com", toDomain: "gmial.com" });
    domainDoesNotExist();

    await executeOutboundSend("out1");

    const failed = failedWrite();
    expect(failed).toBeTruthy();
    expect(failed?.data.lastErrorCode).toBe("RECIPIENT_DOMAIN_DOES_NOT_EXIST");
    expect(failed?.data.failureReason).toMatch(/gmial\.com/);
  });

  it("releases the mailbox reservation it was holding", async () => {
    // A blocked row must not go on consuming a slot in the daily cap.
    setRow({ toEmail: "someone@gmial.com", toDomain: "gmial.com" });
    domainDoesNotExist();

    await executeOutboundSend("out1");

    expect(markReleased).toHaveBeenCalled();
    expect(markConsumed).not.toHaveBeenCalled();
  });
});

describe("a good address is untouched", () => {
  it("sends exactly as before when the domain has an MX record", async () => {
    // The assertion that stops this gate becoming an outage.
    const result = await executeOutboundSend("out1");

    expect(result.ok).toBe(true);
    expect(sendGmail).toHaveBeenCalledTimes(1);
  });

  it("sends when the domain has no MX but does have an A record", async () => {
    resolveMx.mockRejectedValue(dnsError("ENODATA"));
    resolve4.mockResolvedValue(["1.2.3.4"]);

    const result = await executeOutboundSend("out1");

    expect(result.ok).toBe(true);
    expect(sendGmail).toHaveBeenCalledTimes(1);
  });
});

describe("a broken resolver delays mail — it does not drop it, or send blind", () => {
  it("does not hand the message to Gmail", async () => {
    dnsIsBroken();

    const result = await executeOutboundSend("out1");

    expect(result.ok).toBe(false);
    expect(sendGmail).not.toHaveBeenCalled();
  });

  it("puts the row back on the QUEUE rather than failing it", async () => {
    // This is the difference between a safety gate and an outage. The address
    // is probably fine; we just could not check it this minute.
    dnsIsBroken();

    await executeOutboundSend("out1");

    const queued = updateMany.mock.calls.find(
      (c) => (c[0] as { data?: { status?: string } })?.data?.status === "QUEUED",
    )?.[0] as { data: { status: string; nextRetryAt: Date; retryCount: number } } | undefined;

    expect(queued).toBeTruthy();
    expect(queued?.data.retryCount).toBe(1);
    expect(queued?.data.nextRetryAt).toBeInstanceOf(Date);
    expect(failedWrite()).toBeUndefined();
  });

  it("keeps the mailbox reservation, because the row is still going to send", async () => {
    dnsIsBroken();

    await executeOutboundSend("out1");

    expect(markReleased).not.toHaveBeenCalled();
  });
});

describe("the kill switch", () => {
  it("lets a dead domain through when verification is switched off", async () => {
    // Proves the switch is real and reachable without a deploy.
    process.env.RECIPIENT_VERIFICATION_ENABLED = "false";
    setRow({ toEmail: "someone@gmial.com", toDomain: "gmial.com" });
    domainDoesNotExist();

    const result = await executeOutboundSend("out1");

    expect(result.ok).toBe(true);
    expect(sendGmail).toHaveBeenCalledTimes(1);
  });

  it("does not even ask DNS when switched off", async () => {
    process.env.RECIPIENT_VERIFICATION_ENABLED = "false";

    await executeOutboundSend("out1");

    expect(resolveMx).not.toHaveBeenCalled();
  });
});
