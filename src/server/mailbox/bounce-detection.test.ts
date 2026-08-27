import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { outboundFindFirst, outboundUpdate, suppressMock } = vi.hoisted(() => ({
  outboundFindFirst: vi.fn(),
  outboundUpdate: vi.fn(),
  suppressMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    outboundEmail: {
      findFirst: (...a: unknown[]) => outboundFindFirst(...a),
      update: (...a: unknown[]) => outboundUpdate(...a),
    },
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
  outboundUpdate.mockReset();
  outboundUpdate.mockResolvedValue({});
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
    outboundFindFirst.mockResolvedValue({
      id: "out-1",
      contactId: "ct-1",
      status: "SENT",
      lastProviderEventAt: null,
    });

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

/**
 * BLOCKER 1 (customer-ready) — the reported bounce rate was structurally pinned
 * at 0%. Reports counts `OutboundEmail.status == "BOUNCED"`, and the only writer
 * of that status was the Resend webhook — a channel prospect outreach never uses,
 * because every prospect send goes out through Microsoft Graph or Gmail. The NDR
 * path below is the ONLY path that can see a Graph/Gmail bounce, and it suppressed
 * the address (the safety half worked) without ever stamping the row the metric
 * reads (the half the client judges deliverability by).
 */
describe("processSyncedMessageForBounce — stamps the row the report counts", () => {
  it("marks the outbound row BOUNCED so the reported bounce rate can move", async () => {
    process.env[FLAG] = "true";
    outboundFindFirst.mockResolvedValue({
      id: "out-1",
      contactId: "ct-1",
      status: "SENT",
      lastProviderEventAt: null,
    });

    const r = await processSyncedMessageForBounce(HARD_NDR);

    expect(r.suppressed).toBe(true);
    expect(r.statusStamped).toBe(true);
    expect(outboundUpdate).toHaveBeenCalledTimes(1);
    const call = outboundUpdate.mock.calls[0][0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(call.where).toEqual({ id: "out-1" });
    expect(call.data).toMatchObject({
      status: "BOUNCED",
      bouncedAt: AT,
      bounceCategory: expect.stringContaining("ndr:"),
      lastProviderEventType: "mailbox_sync_ndr",
      lastProviderEventAt: AT,
    });
  });

  it("never downgrades a REPLIED row — a human answered, that wins", async () => {
    process.env[FLAG] = "true";
    outboundFindFirst.mockResolvedValue({
      id: "out-1",
      contactId: "ct-1",
      status: "REPLIED",
      lastProviderEventAt: null,
    });

    const r = await processSyncedMessageForBounce(HARD_NDR);

    // Still suppressed — the address is dead regardless of the milestone.
    expect(r.suppressed).toBe(true);
    expect(r.statusStamped).toBe(false);
    expect(outboundUpdate).not.toHaveBeenCalled();
  });

  it("does not stamp when we never sent to that address", async () => {
    process.env[FLAG] = "true";
    outboundFindFirst.mockResolvedValue(null);

    const r = await processSyncedMessageForBounce(HARD_NDR);

    expect(r.statusStamped).toBe(false);
    expect(outboundUpdate).not.toHaveBeenCalled();
  });
});
