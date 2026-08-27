import { describe, expect, it } from "vitest";

import {
  deriveDeliveryStatus,
  deriveOpensLabel,
  summarizeDelivery,
  type ContactOutreachInput,
} from "./delivery-status";

function base(): ContactOutreachInput {
  return {
    stepSendStatus: null,
    outboundStatus: null,
    hasOutboundEmail: false,
    hasProviderProof: false,
    sentAt: null,
    bouncedAt: null,
    openedAt: null,
    repliedAt: null,
    unsubscribedAt: null,
    isSuppressed: false,
    hasLinkedReply: false,
  };
}

describe("deriveDeliveryStatus", () => {
  it("returns 'Not sent' when no outreach data exists", () => {
    expect(deriveDeliveryStatus(base())).toBe("Not sent");
  });

  it("returns 'Awaiting send' for PLANNED step send with no OutboundEmail", () => {
    expect(
      deriveDeliveryStatus({ ...base(), stepSendStatus: "PLANNED" }),
    ).toBe("Awaiting send");
  });

  it("returns 'Awaiting send' for READY step send with no OutboundEmail", () => {
    expect(
      deriveDeliveryStatus({ ...base(), stepSendStatus: "READY" }),
    ).toBe("Awaiting send");
  });

  it("returns 'Queued' (not 'Awaiting send') once a real OutboundEmail is queued", () => {
    expect(
      deriveDeliveryStatus({
        ...base(),
        stepSendStatus: "READY",
        outboundStatus: "QUEUED",
        hasOutboundEmail: true,
      }),
    ).toBe("Queued");
  });

  it("returns 'Queued' for QUEUED outbound", () => {
    expect(
      deriveDeliveryStatus({ ...base(), outboundStatus: "QUEUED" }),
    ).toBe("Queued");
  });

  it("returns 'Queued' for PROCESSING outbound", () => {
    expect(
      deriveDeliveryStatus({ ...base(), outboundStatus: "PROCESSING" }),
    ).toBe("Queued");
  });

  it("returns 'Queued' for QUEUED outbound even when stepSendStatus is SENT", () => {
    expect(
      deriveDeliveryStatus({
        ...base(),
        stepSendStatus: "SENT",
        outboundStatus: "QUEUED",
        hasOutboundEmail: true,
      }),
    ).toBe("Queued");
  });

  it("returns 'Queued' for PROCESSING outbound even when stepSendStatus is SENT", () => {
    expect(
      deriveDeliveryStatus({
        ...base(),
        stepSendStatus: "SENT",
        outboundStatus: "PROCESSING",
        hasOutboundEmail: true,
      }),
    ).toBe("Queued");
  });

  // --- PR #132 send-proof tests ---

  it("returns 'Sent, not confirmed' when step-send SENT but no OutboundEmail", () => {
    expect(
      deriveDeliveryStatus({
        ...base(),
        stepSendStatus: "SENT",
        hasOutboundEmail: false,
      }),
    ).toBe("Sent, not confirmed");
  });

  it("returns 'Sent, not confirmed' when step-send SENT with OutboundEmail but no proof", () => {
    expect(
      deriveDeliveryStatus({
        ...base(),
        stepSendStatus: "SENT",
        hasOutboundEmail: true,
        hasProviderProof: false,
        sentAt: null,
      }),
    ).toBe("Sent, not confirmed");
  });

  it("returns 'Sent — time unavailable' when step-send SENT with providerProof but no sentAt", () => {
    expect(
      deriveDeliveryStatus({
        ...base(),
        stepSendStatus: "SENT",
        hasOutboundEmail: true,
        hasProviderProof: true,
        sentAt: null,
      }),
    ).toBe("Sent — time unavailable");
  });

  it("returns 'Sent from mailbox' when step-send SENT with sentAt", () => {
    expect(
      deriveDeliveryStatus({
        ...base(),
        stepSendStatus: "SENT",
        hasOutboundEmail: true,
        hasProviderProof: true,
        sentAt: new Date(),
      }),
    ).toBe("Sent from mailbox");
  });

  it("returns 'Sent from mailbox' when outbound SENT with sentAt", () => {
    expect(
      deriveDeliveryStatus({
        ...base(),
        outboundStatus: "SENT",
        hasOutboundEmail: true,
        hasProviderProof: true,
        sentAt: new Date(),
      }),
    ).toBe("Sent from mailbox");
  });

  it("returns 'Sent from mailbox' when outbound is DELIVERED with sentAt", () => {
    expect(
      deriveDeliveryStatus({
        ...base(),
        outboundStatus: "DELIVERED",
        hasOutboundEmail: true,
        sentAt: new Date(),
      }),
    ).toBe("Sent from mailbox");
  });

  it("returns 'Sent — time unavailable' when outbound is DELIVERED but no sentAt, with proof", () => {
    expect(
      deriveDeliveryStatus({
        ...base(),
        outboundStatus: "DELIVERED",
        hasOutboundEmail: true,
        hasProviderProof: true,
        sentAt: null,
      }),
    ).toBe("Sent — time unavailable");
  });

  it("returns 'Failed' when step send FAILED", () => {
    expect(
      deriveDeliveryStatus({ ...base(), stepSendStatus: "FAILED" }),
    ).toBe("Failed");
  });

  it("returns 'Failed' when outbound FAILED", () => {
    expect(
      deriveDeliveryStatus({ ...base(), outboundStatus: "FAILED" }),
    ).toBe("Failed");
  });

  it("returns 'Bounced' when outbound is BOUNCED", () => {
    expect(
      deriveDeliveryStatus({ ...base(), outboundStatus: "BOUNCED" }),
    ).toBe("Bounced");
  });

  it("returns 'Bounced' when bouncedAt is set", () => {
    expect(
      deriveDeliveryStatus({
        ...base(),
        outboundStatus: "SENT",
        bouncedAt: new Date(),
      }),
    ).toBe("Bounced");
  });

  it("returns 'Replied' when linked reply exists", () => {
    expect(
      deriveDeliveryStatus({
        ...base(),
        outboundStatus: "SENT",
        hasOutboundEmail: true,
        sentAt: new Date(),
        hasLinkedReply: true,
        repliedAt: new Date(),
      }),
    ).toBe("Replied");
  });

  it("returns 'Replied' when outbound status is REPLIED", () => {
    expect(
      deriveDeliveryStatus({ ...base(), outboundStatus: "REPLIED" }),
    ).toBe("Replied");
  });

  it("returns 'Unsubscribed' when unsubscribedAt is set", () => {
    expect(
      deriveDeliveryStatus({
        ...base(),
        outboundStatus: "SENT",
        hasOutboundEmail: true,
        sentAt: new Date(),
        unsubscribedAt: new Date(),
      }),
    ).toBe("Unsubscribed");
  });

  it("returns 'Suppressed / skipped' for SUPPRESSED step send", () => {
    expect(
      deriveDeliveryStatus({ ...base(), stepSendStatus: "SUPPRESSED" }),
    ).toBe("Suppressed / skipped");
  });

  it("returns 'Suppressed / skipped' for SKIPPED step send", () => {
    expect(
      deriveDeliveryStatus({ ...base(), stepSendStatus: "SKIPPED" }),
    ).toBe("Suppressed / skipped");
  });

  it("returns 'Suppressed / skipped' for BLOCKED step send", () => {
    expect(
      deriveDeliveryStatus({ ...base(), stepSendStatus: "BLOCKED" }),
    ).toBe("Suppressed / skipped");
  });

  it("returns 'Suppressed / skipped' for BLOCKED_SUPPRESSION outbound", () => {
    expect(
      deriveDeliveryStatus({ ...base(), outboundStatus: "BLOCKED_SUPPRESSION" }),
    ).toBe("Suppressed / skipped");
  });

  it("returns 'Suppressed / skipped' for contact.isSuppressed with no sends", () => {
    expect(
      deriveDeliveryStatus({ ...base(), isSuppressed: true }),
    ).toBe("Suppressed / skipped");
  });

  it("unsubscribe takes priority over replied", () => {
    expect(
      deriveDeliveryStatus({
        ...base(),
        outboundStatus: "REPLIED",
        unsubscribedAt: new Date(),
        hasLinkedReply: true,
        repliedAt: new Date(),
      }),
    ).toBe("Unsubscribed");
  });

  it("reply takes priority over bounce", () => {
    expect(
      deriveDeliveryStatus({
        ...base(),
        outboundStatus: "BOUNCED",
        hasLinkedReply: true,
        repliedAt: new Date(),
      }),
    ).toBe("Replied");
  });

  it("stepSendStatus SENT alone never produces 'Sent from mailbox'", () => {
    const result = deriveDeliveryStatus({
      ...base(),
      stepSendStatus: "SENT",
    });
    expect(result).not.toBe("Sent from mailbox");
    expect(result).toBe("Sent, not confirmed");
  });

  it("outbound SENT with sentAt but no providerProof still shows 'Sent from mailbox' because sentAt is proof", () => {
    expect(
      deriveDeliveryStatus({
        ...base(),
        outboundStatus: "SENT",
        hasOutboundEmail: true,
        hasProviderProof: false,
        sentAt: new Date(),
      }),
    ).toBe("Sent from mailbox");
  });
});

describe("deriveOpensLabel", () => {
  it("returns 'Not tracked' when openedAt is null", () => {
    expect(deriveOpensLabel(null)).toBe("Not tracked");
  });

  it("returns formatted date when openedAt is set", () => {
    const label = deriveOpensLabel(new Date("2026-01-15T12:00:00Z"));
    expect(label).toMatch(/^Opened /);
    expect(label).toMatch(/15/);
    expect(label).toMatch(/2026/);
  });
});

describe("summarizeDelivery", () => {
  it("counts all status types correctly including new labels", () => {
    const statuses = [
      "Sent from mailbox" as const,
      "Sent — time unavailable" as const,
      "Sent, not confirmed" as const,
      "Failed" as const,
      "Bounced" as const,
      "Replied" as const,
      "Unsubscribed" as const,
      "Suppressed / skipped" as const,
      "Not sent" as const,
      "Awaiting send" as const,
      "Queued" as const,
    ];
    const s = summarizeDelivery(statuses, 7);
    expect(s.totalContacts).toBe(11);
    expect(s.emailSendable).toBe(7);
    expect(s.sent).toBe(2);
    expect(s.awaitingSend).toBe(1);
    expect(s.queued).toBe(1);
    expect(s.sentProofMissing).toBe(1);
    expect(s.failed).toBe(1);
    expect(s.bounced).toBe(1);
    expect(s.replied).toBe(1);
    expect(s.unsubscribed).toBe(1);
    expect(s.suppressed).toBe(1);
  });

  it("returns zero summary for empty array", () => {
    const s = summarizeDelivery([], 0);
    expect(s.totalContacts).toBe(0);
    expect(s.sent).toBe(0);
    expect(s.queued).toBe(0);
    expect(s.sentProofMissing).toBe(0);
  });
});
