import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Proof at the SEND PATH, not the helper.
 *
 * `decideClientOpenTracking` has its own unit tests, but a correct decision
 * function wired to nothing is this project's most repeated defect. These tests
 * drive the real `executeOutboundSend` and read the HTML body it hands to the
 * transport, so they fail if the pixel is present in an email that must not
 * carry one — whatever the reason.
 */

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
  markReservationConsumedForOutbound: (...a: unknown[]) => markConsumed(...a),
  markReservationReleasedForOutbound: (...a: unknown[]) => markReleased(...a),
}));
vi.mock("@/server/mailbox/google-mailbox-access", () => ({
  getGoogleGmailAccessTokenForMailbox: (...a: unknown[]) => getGoogleToken(...a),
}));
const { buildRfc } = vi.hoisted(() => ({
  // Typed so the assertions below can read the HTML body off the call args.
  buildRfc: vi.fn<(args: { bodyHtml?: string }) => string>(() => "rfc"),
}));
vi.mock("@/server/mailbox/gmail-sendmail", () => ({
  buildRfc5322PlainTextEmail: (...a: unknown[]) => (buildRfc as (...x: unknown[]) => string)(...a),
  sendGmailUsersMessagesSend: (...a: unknown[]) => sendGmail(...a),
  generateRfc822MessageId: () => "<test-msg-id@workspace.test>",
}));
vi.mock("@/server/outreach/suppression-guard", () => ({
  evaluateSuppression: (...a: unknown[]) => evalSupp(...a),
}));

import { TRACKING_DNS_MAX_AGE_DAYS } from "@/lib/tracking/client-open-tracking";

import { executeOutboundSend } from "./execute-one";

const PIXEL_PATH = "/api/track/open/";
const VERIFIED_AT = new Date("2026-08-01T00:00:00.000Z");
const OPTED_IN_AT = new Date("2026-08-20T00:00:00.000Z");
/**
 * Relative to now, not a fixed date. The send-time gate expires a verification
 * after TRACKING_DNS_MAX_AGE_DAYS, so a hard-coded timestamp here would quietly
 * become stale and turn this suite red on some future Tuesday for a reason that
 * has nothing to do with the code.
 */
const DNS_VERIFIED_AT = new Date(Date.now() - 60 * 60 * 1000);

const baseRow = {
  id: "out1",
  clientId: "c1",
  toEmail: "to@bidlow.co.uk",
  toDomain: "bidlow.co.uk",
  status: "PROCESSING" as const,
  providerMessageId: null,
  subject: "ODoutreach test send — governed mailbox proof",
  bodySnapshot: "Hello there.",
  correlationId: "corr-9",
  mailboxIdentityId: "m1",
  fromAddress: "from@workspace.test",
  sendAttempt: 0,
  retryCount: 0,
  providerIdempotencyKey: null,
};

/** The HTML body actually handed to the Gmail transport for the one send. */
function sentHtml(): string {
  return buildRfc.mock.calls[0]?.[0]?.bodyHtml ?? "";
}

const prevPixelEnv = process.env.OPEN_TRACKING_PIXEL;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.OPEN_TRACKING_PIXEL;
  findUnique.mockImplementation(
    (q: { select?: Record<string, unknown> } | undefined) => {
      if (q?.select && "mailboxIdentityId" in q.select) {
        return Promise.resolve({ mailboxIdentityId: "m1" });
      }
      return Promise.resolve({ ...baseRow });
    },
  );
  updateMany.mockResolvedValue({ count: 1 });
  findFirstMbox.mockResolvedValue({
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
  });
  evalSupp.mockResolvedValue({ suppressed: false });
  getGoogleToken.mockResolvedValue("access");
  sendGmail.mockResolvedValue({
    ok: true,
    providerMessageId: "gmail:abc123",
    providerName: "google_gmail",
  });
});

afterEach(() => {
  if (prevPixelEnv === undefined) delete process.env.OPEN_TRACKING_PIXEL;
  else process.env.OPEN_TRACKING_PIXEL = prevPixelEnv;
});

describe("executeOutboundSend — the open-tracking pixel is per-client and off by default", () => {
  it("sends NO pixel for a client that has not opted in, even with a verified domain", async () => {
    clientFindUnique.mockResolvedValue({
      outreachLinkDomain: "go.workspace.test",
      outreachLinkDomainVerifiedAt: VERIFIED_AT,
      openTrackingEnabledAt: null,
    });

    const r = await executeOutboundSend("out1");

    expect(r.ok).toBe(true);
    expect(sendGmail).toHaveBeenCalledTimes(1);
    expect(sentHtml()).not.toContain(PIXEL_PATH);
    expect(sentHtml().length).toBeGreaterThan(0);
  });

  it("sends NO pixel for a client with no tracking setup at all", async () => {
    clientFindUnique.mockResolvedValue({
      outreachLinkDomain: null,
      outreachLinkDomainVerifiedAt: null,
      openTrackingEnabledAt: null,
    });

    await executeOutboundSend("out1");

    expect(sentHtml()).not.toContain(PIXEL_PATH);
  });

  it("sends NO pixel when the client row cannot be read", async () => {
    clientFindUnique.mockResolvedValue(null);

    await executeOutboundSend("out1");

    expect(sentHtml()).not.toContain(PIXEL_PATH);
  });

  it("DOES send a pixel, on the customer's own domain, once opted in and verified", async () => {
    clientFindUnique.mockResolvedValue({
      outreachLinkDomain: "go.workspace.test",
      outreachLinkDomainVerifiedAt: VERIFIED_AT,
      openTrackingEnabledAt: OPTED_IN_AT,
      // Since row 41 this is required too, and it is required HERE, in the real
      // dispatcher, not only in the pure decision function. Adding the gate sent
      // this test red on exactly one assertion — which is how we know the
      // email-authentication check is genuinely in the send path.
      trackingDnsVerifiedAt: DNS_VERIFIED_AT,
    });

    await executeOutboundSend("out1");

    expect(sentHtml()).toContain("https://go.workspace.test/api/track/open/corr-9");
  });

  it("sends NO pixel for an opted-in, domain-verified client whose DNS we never checked", async () => {
    /*
      The row-41 gate proved against the REAL dispatcher rather than the pure
      function. Everything else about this client is perfect: they opted in,
      their tracking host is verified, the kill switch is off. The one thing
      missing is that this system has never resolved their SPF, DKIM and DMARC,
      and that alone is enough for the email to go out carrying no pixel.
    */
    clientFindUnique.mockResolvedValue({
      outreachLinkDomain: "go.workspace.test",
      outreachLinkDomainVerifiedAt: VERIFIED_AT,
      openTrackingEnabledAt: OPTED_IN_AT,
      trackingDnsVerifiedAt: null,
    });

    const r = await executeOutboundSend("out1");

    // The mail still SENDS. A missing pixel is never a reason to hold outreach.
    expect(r.ok).toBe(true);
    expect(sendGmail).toHaveBeenCalledTimes(1);
    expect(sentHtml()).not.toContain(PIXEL_PATH);
  });

  it("sends NO pixel once the DNS verification goes stale, with nothing having run", async () => {
    // The backstop that does not depend on the scheduled sweep firing. The last
    // passing check is older than the freshness window, so the dispatcher closes
    // the gate by arithmetic alone.
    clientFindUnique.mockResolvedValue({
      outreachLinkDomain: "go.workspace.test",
      outreachLinkDomainVerifiedAt: VERIFIED_AT,
      openTrackingEnabledAt: OPTED_IN_AT,
      trackingDnsVerifiedAt: new Date(
        Date.now() - (TRACKING_DNS_MAX_AGE_DAYS + 1) * 24 * 60 * 60 * 1000,
      ),
    });

    await executeOutboundSend("out1");

    expect(sentHtml()).not.toContain(PIXEL_PATH);
  });

  it("sends NO pixel for an opted-in client whose domain is not verified", async () => {
    clientFindUnique.mockResolvedValue({
      outreachLinkDomain: "go.workspace.test",
      outreachLinkDomainVerifiedAt: null,
      openTrackingEnabledAt: OPTED_IN_AT,
    });

    await executeOutboundSend("out1");

    expect(sentHtml()).not.toContain(PIXEL_PATH);
  });

  it("sends NO pixel when the global kill switch is engaged, opt-in or not", async () => {
    process.env.OPEN_TRACKING_PIXEL = "off";
    clientFindUnique.mockResolvedValue({
      outreachLinkDomain: "go.workspace.test",
      outreachLinkDomainVerifiedAt: VERIFIED_AT,
      openTrackingEnabledAt: OPTED_IN_AT,
    });

    await executeOutboundSend("out1");

    expect(sentHtml()).not.toContain(PIXEL_PATH);
  });
});
