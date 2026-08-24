import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The `/contacts` "Send" control had no send-governance check.
 *
 * Every other real-prospect path — the sequence dispatcher, controlled pilot —
 * runs `evaluateSendGovernance` before it will email a stranger. This one did
 * not. It checked tenant access, suppression and mailbox capacity, then queued.
 * So a workspace that was PAUSED, never launch-approved, or had no working
 * opt-out could still send a live outreach email from this button, and the
 * automated path's refusal to do exactly that was bypassable by hand.
 *
 * Worse, the unsubscribe link it planted came from `resolvePublicBaseUrl()` —
 * the OpensDoors app domain — while the mail left the CLIENT's own domain. That
 * is the link misalignment recorded in DOMAIN.json as the 2026 quarantine root
 * cause. The sequence dispatcher was fixed for it; this path was missed.
 *
 * These tests pin both, and they are written to fail closed: each one asserts
 * a REFUSAL, because a gate that has only ever been seen to allow has not been
 * shown to gate anything.
 */

const prismaMock = vi.hoisted(() => ({
  contact: { findFirst: vi.fn() },
  client: { findFirst: vi.fn() },
  outboundEmail: { create: vi.fn() },
  $transaction: vi.fn(),
}));

const evaluateSuppressionMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ suppressed: false }),
);
const loadGovernedSendingMailboxMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ mode: "ineligible", reason: "no_mailbox", mailbox: null }),
);

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/server/tenant/access", () => ({
  requireClientAccess: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/server/outreach/suppression-guard", () => ({
  evaluateSuppression: (...a: unknown[]) => evaluateSuppressionMock(...a),
}));
vi.mock("@/server/email/outbound/trigger-queue", () => ({
  triggerOutboundQueueDrain: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/server/mailbox/sending-policy", () => ({
  loadGovernedSendingMailbox: (...a: unknown[]) => loadGovernedSendingMailboxMock(...a),
  buildContactSendIdempotencyKey: () => "idem-1",
  humanizeGovernanceRejection: (reason: string) => `mailbox: ${reason}`,
  linkReservationToOutboundInTransaction: vi.fn(),
  tryReserveSendSlotInTransaction: vi.fn(),
}));

import { sendEmailToContact } from "./send-outbound";

const staff = { id: "staff-1" } as never;

/** An ACTIVE, launch-approved workspace with no verified aligned link domain. */
const ACTIVE_CLIENT = {
  defaultSenderEmail: "adam@opensdoors.co.uk",
  status: "ACTIVE",
  launchApprovedAt: new Date("2026-06-01T00:00:00Z"),
  launchApprovalMode: "LIVE_PROSPECT",
  outreachLinkDomain: null,
  outreachLinkDomainVerifiedAt: null,
};

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("AUTH_URL", "https://opensdoors.bidlow.co.uk");
  vi.stubEnv("GOVERNED_TEST_EMAIL_DOMAINS", "bidlow.co.uk");
  evaluateSuppressionMock.mockResolvedValue({ suppressed: false });
  loadGovernedSendingMailboxMock.mockResolvedValue({
    mode: "ineligible",
    reason: "no_mailbox",
    mailbox: null,
  });
  prismaMock.contact.findFirst.mockResolvedValue({
    id: "contact-1",
    clientId: "client-1",
    email: "stranger@prospect.com",
    emailDomain: "prospect.com",
  });
  prismaMock.client.findFirst.mockResolvedValue(ACTIVE_CLIENT);
});

const send = () =>
  sendEmailToContact({
    staff,
    clientId: "client-1",
    contactId: "contact-1",
    subject: "Catering options",
    bodyText: "Hello there.",
  });

describe("the /contacts send button is governed", () => {
  it("REFUSES a real prospect when the workspace is not ACTIVE", async () => {
    prismaMock.client.findFirst.mockResolvedValue({
      ...ACTIVE_CLIENT,
      status: "PAUSED",
    });

    const result = await send();

    expect(result.ok).toBe(false);
    // It must not have got as far as choosing a mailbox.
    expect(loadGovernedSendingMailboxMock).not.toHaveBeenCalled();
    expect(prismaMock.outboundEmail.create).not.toHaveBeenCalled();
  });

  it("REFUSES a real prospect when there is no opt-out rail at all", async () => {
    // No aligned link domain AND no sender address to receive a mailto opt-out
    // leaves the recipient with no way to opt out. That must block.
    prismaMock.client.findFirst.mockResolvedValue({
      ...ACTIVE_CLIENT,
      defaultSenderEmail: null,
    });

    const result = await send();

    expect(result.ok).toBe(false);
    expect(loadGovernedSendingMailboxMock).not.toHaveBeenCalled();
  });

  it("does NOT put the OpensDoors app domain in a real prospect's unsubscribe link", async () => {
    // The workspace is ACTIVE with a usable mailto rail, so governance allows
    // the send and it proceeds to mailbox selection (which we stub as
    // ineligible — we only care about the body it built on the way).
    let capturedBody: string | undefined;
    loadGovernedSendingMailboxMock.mockImplementation(async () => {
      return { mode: "ineligible", reason: "no_mailbox", mailbox: null };
    });
    evaluateSuppressionMock.mockResolvedValue({ suppressed: true, reason: "TEST" });
    prismaMock.outboundEmail.create.mockImplementation(
      async ({ data }: { data: { bodySnapshot: string } }) => {
        capturedBody = data.bodySnapshot;
        return { id: "ob-1", correlationId: "corr-1" };
      },
    );

    await send();

    expect(capturedBody).toBeDefined();
    expect(capturedBody).not.toContain("opensdoors.bidlow.co.uk");
    // It falls back to the mailto rail, which carries no foreign host.
    expect(capturedBody).toContain("mailto:adam@opensdoors.co.uk");
  });

  it("still allows an allowlisted internal recipient, keeping the hosted link", async () => {
    let capturedBody: string | undefined;
    prismaMock.contact.findFirst.mockResolvedValue({
      id: "contact-1",
      clientId: "client-1",
      email: "greg@bidlow.co.uk",
      emailDomain: "bidlow.co.uk",
    });
    evaluateSuppressionMock.mockResolvedValue({ suppressed: true, reason: "TEST" });
    prismaMock.outboundEmail.create.mockImplementation(
      async ({ data }: { data: { bodySnapshot: string } }) => {
        capturedBody = data.bodySnapshot;
        return { id: "ob-1", correlationId: "corr-1" };
      },
    );

    await send();

    // Internal recipient — the app domain is the documented carve-out.
    expect(capturedBody).toContain("https://opensdoors.bidlow.co.uk/unsubscribe/");
  });

  it("uses the client's OWN verified link domain when one is configured", async () => {
    let capturedBody: string | undefined;
    prismaMock.client.findFirst.mockResolvedValue({
      ...ACTIVE_CLIENT,
      outreachLinkDomain: "go.prospectclient.co.uk",
      outreachLinkDomainVerifiedAt: new Date("2026-07-01T00:00:00Z"),
    });
    evaluateSuppressionMock.mockResolvedValue({ suppressed: true, reason: "TEST" });
    prismaMock.outboundEmail.create.mockImplementation(
      async ({ data }: { data: { bodySnapshot: string } }) => {
        capturedBody = data.bodySnapshot;
        return { id: "ob-1", correlationId: "corr-1" };
      },
    );

    await send();

    expect(capturedBody).toContain("https://go.prospectclient.co.uk/unsubscribe/");
    expect(capturedBody).not.toContain("opensdoors.bidlow.co.uk");
  });
});
