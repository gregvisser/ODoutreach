import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { suppressMock } = vi.hoisted(() => ({ suppressMock: vi.fn() }));

vi.mock("@/server/email/bounce-suppression", () => ({
  suppressRecipientForHardBounce: (...a: unknown[]) => suppressMock(...a),
}));

import { suppressReplyOptOut } from "./opt-out-detection";

const FLAG = "MAILBOX_COMPLAINT_DETECTION_ENABLED";
const prev = process.env[FLAG];
const AT = new Date("2026-06-25T12:00:00.000Z");

function input(over: Record<string, unknown> = {}) {
  return {
    clientId: "client-1",
    fromEmail: "cameron@octaviangr.com",
    subject: "Re: Office maintenance",
    bodyText: "Please remove me from your list and stop emailing me.",
    contactId: "ct-1",
    outboundEmailId: "out-1",
    receivedAt: AT,
    ...over,
  };
}

beforeEach(() => {
  suppressMock.mockReset();
  suppressMock.mockResolvedValue({ suppressed: true, newlyCreated: true });
});
afterEach(() => {
  if (prev === undefined) delete process.env[FLAG];
  else process.env[FLAG] = prev;
});

describe("suppressReplyOptOut (H3)", () => {
  it("honours STOP without feature configuration", async () => {
    delete process.env[FLAG];
    expect((await suppressReplyOptOut(input({ bodyText: "STOP" }))).suppressed).toBe(true);
  });
  it("no-ops with the flag OFF", async () => {
    process.env[FLAG] = "false";
    const r = await suppressReplyOptOut(input());
    expect(r.suppressed).toBe(false);
    expect(suppressMock).not.toHaveBeenCalled();
  });

  it("suppresses the sender as a complaint on an explicit opt-out (flag on)", async () => {
    process.env[FLAG] = "true";
    const r = await suppressReplyOptOut(input());
    expect(r.suppressed).toBe(true);
    expect(r.recipient).toBe("cameron@octaviangr.com");
    expect(suppressMock).toHaveBeenCalledTimes(1);
    expect(suppressMock.mock.calls[0][0]).toMatchObject({
      clientId: "client-1",
      email: "cameron@octaviangr.com",
      outboundEmailId: "out-1",
      contactId: "ct-1",
      reason: "complaint",
      providerEventType: "reply_opt_out",
    });
  });

  it("does NOT suppress a normal positive reply (flag on)", async () => {
    process.env[FLAG] = "true";
    const r = await suppressReplyOptOut(
      input({ bodyText: "Sounds great, let's book a call." }),
    );
    expect(r.suppressed).toBe(false);
    expect(suppressMock).not.toHaveBeenCalled();
  });
});
