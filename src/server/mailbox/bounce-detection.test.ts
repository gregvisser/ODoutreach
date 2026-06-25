import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { outboundFindFirst, suppressMock } = vi.hoisted(() => ({
  outboundFindFirst: vi.fn(),
  suppressMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    outboundEmail: { findFirst: (...a: unknown[]) => outboundFindFirst(...a) },
  },
}));

vi.mock("@/server/email/bounce-suppression", () => ({
  suppressRecipientForHardBounce: (...a: unknown[]) => suppressMock(...a),
}));

import { processSyncedMessageForBounce } from "./bounce-detection";

const FLAG = "MAILBOX_BOUNCE_DETECTION_ENABLED";
const prev = process.env[FLAG];
const AT = new Date("2026-06-25T12:00:00.000Z");

const HARD_NDR = {
  clientId: "client-1",
  mailboxIdentityId: "mb-1",
  providerMessageId: "ndr-1",
  fromEmail: "postmaster@morsonfm.co.uk",
  subject: "Undeliverable: hello",
  bodyText:
    "Final-Recipient: rfc822; dead@octaviangr.com\nAction: failed\nStatus: 5.1.1\n550 user unknown",
  receivedAt: AT,
};

beforeEach(() => {
  outboundFindFirst.mockReset();
  suppressMock.mockReset();
  suppressMock.mockResolvedValue({ suppressed: true, newlyCreated: true });
});

afterEach(() => {
  if (prev === undefined) delete process.env[FLAG];
  else process.env[FLAG] = prev;
});

describe("processSyncedMessageForBounce (H2)", () => {
  it("no-ops with the flag OFF (no query, no suppress)", async () => {
    delete process.env[FLAG];
    const r = await processSyncedMessageForBounce(HARD_NDR);
    expect(r.suppressed).toBe(false);
    expect(outboundFindFirst).not.toHaveBeenCalled();
    expect(suppressMock).not.toHaveBeenCalled();
  });

  it("suppresses a hard bounce for an address we actually sent to", async () => {
    process.env[FLAG] = "true";
    outboundFindFirst.mockResolvedValue({ id: "out-1", contactId: "ct-1" });

    const r = await processSyncedMessageForBounce(HARD_NDR);

    expect(r.suppressed).toBe(true);
    expect(r.recipient).toBe("dead@octaviangr.com");
    expect(suppressMock).toHaveBeenCalledTimes(1);
    expect(suppressMock.mock.calls[0][0]).toMatchObject({
      clientId: "client-1",
      email: "dead@octaviangr.com",
      outboundEmailId: "out-1",
      contactId: "ct-1",
      reason: "hard_bounce",
      providerEventType: "mailbox_sync_ndr",
    });
  });

  it("SAFETY GATE — does NOT suppress when we never sent to that address", async () => {
    process.env[FLAG] = "true";
    outboundFindFirst.mockResolvedValue(null); // no matching outbound

    const r = await processSyncedMessageForBounce(HARD_NDR);

    expect(r.suppressed).toBe(false);
    expect(outboundFindFirst).toHaveBeenCalledTimes(1);
    expect(suppressMock).not.toHaveBeenCalled();
  });

  it("does NOT suppress a soft/transient bounce even with the flag on", async () => {
    process.env[FLAG] = "true";
    const r = await processSyncedMessageForBounce({
      ...HARD_NDR,
      bodyText:
        "Final-Recipient: rfc822; busy@octaviangr.com\nAction: delayed\nStatus: 4.2.2\nmailbox full",
    });
    expect(r.suppressed).toBe(false);
    expect(outboundFindFirst).not.toHaveBeenCalled();
    expect(suppressMock).not.toHaveBeenCalled();
  });

  it("does NOT suppress a genuine human reply", async () => {
    process.env[FLAG] = "true";
    const r = await processSyncedMessageForBounce({
      ...HARD_NDR,
      fromEmail: "cameron@octaviangr.com",
      subject: "Re: hello",
      bodyText: "Sounds good, let's talk.",
    });
    expect(r.suppressed).toBe(false);
    expect(suppressMock).not.toHaveBeenCalled();
  });
});
