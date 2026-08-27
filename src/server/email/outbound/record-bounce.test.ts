import { beforeEach, describe, expect, it, vi } from "vitest";

const { outboundUpdate } = vi.hoisted(() => ({ outboundUpdate: vi.fn() }));

vi.mock("@/lib/db", () => ({
  prisma: { outboundEmail: { update: (...a: unknown[]) => outboundUpdate(...a) } },
}));

import { recordOutboundBounce, stampOutboundBounce } from "./record-bounce";

const AT = new Date("2026-08-27T09:00:00.000Z");

const lastCall = () =>
  outboundUpdate.mock.calls[outboundUpdate.mock.calls.length - 1][0] as {
    where: { id: string };
    data: Record<string, unknown>;
  };

beforeEach(() => {
  outboundUpdate.mockReset();
  outboundUpdate.mockResolvedValue({});
});

describe("recordOutboundBounce — the one writer of BOUNCED", () => {
  it("stamps a SENT row BOUNCED with the timestamp the report windows on", async () => {
    const r = await recordOutboundBounce({
      outbound: { id: "out-1", status: "SENT", lastProviderEventAt: null },
      at: AT,
      bounceCategory: "ndr:5.1.1",
      providerEventType: "mailbox_sync_ndr",
    });

    expect(r).toMatchObject({ mode: "apply_status", statusStamped: true });
    expect(lastCall().data).toEqual({
      status: "BOUNCED",
      bouncedAt: AT,
      bounceCategory: "ndr:5.1.1",
      lastProviderEventType: "mailbox_sync_ndr",
      providerStatus: "mailbox_sync_ndr",
      lastProviderEventAt: AT,
    });
  });

  it("stamps a DELIVERED row too — delivery to a relay then a later NDR is real", async () => {
    const r = await recordOutboundBounce({
      outbound: { id: "out-2", status: "DELIVERED", lastProviderEventAt: null },
      at: AT,
      bounceCategory: null,
      providerEventType: "mailbox_sync_ndr",
    });
    expect(r.statusStamped).toBe(true);
    expect(lastCall().data).toMatchObject({ status: "BOUNCED" });
  });

  it("keeps REPLIED — a human answered, so the row is not rewritten", async () => {
    const r = await recordOutboundBounce({
      outbound: { id: "out-3", status: "REPLIED", lastProviderEventAt: null },
      at: AT,
      bounceCategory: null,
      providerEventType: "mailbox_sync_ndr",
    });
    expect(r).toMatchObject({ mode: "skip", statusStamped: false });
    expect(outboundUpdate).not.toHaveBeenCalled();
  });

  it("refreshes metadata only on an already-terminal row, without re-stamping", async () => {
    const r = await recordOutboundBounce({
      outbound: { id: "out-4", status: "BLOCKED_SUPPRESSION", lastProviderEventAt: null },
      at: AT,
      bounceCategory: "ndr:5.1.1",
      providerEventType: "mailbox_sync_ndr",
    });
    expect(r).toMatchObject({ mode: "metadata_only", statusStamped: false });
    expect(lastCall().data).toEqual({
      lastProviderEventType: "mailbox_sync_ndr",
      providerStatus: "mailbox_sync_ndr",
      lastProviderEventAt: AT,
    });
  });

  it("ignores an event older than the last one already applied", async () => {
    const r = await recordOutboundBounce({
      outbound: {
        id: "out-5",
        status: "SENT",
        lastProviderEventAt: new Date("2026-08-27T10:00:00.000Z"),
      },
      at: AT,
      bounceCategory: null,
      providerEventType: "mailbox_sync_ndr",
    });
    expect(r.mode).toBe("skip");
    expect(outboundUpdate).not.toHaveBeenCalled();
  });

  it("does NOT stamp a QUEUED row — nothing was sent, so nothing bounced", async () => {
    const r = await recordOutboundBounce({
      outbound: { id: "out-6", status: "QUEUED", lastProviderEventAt: null },
      at: AT,
      bounceCategory: null,
      providerEventType: "mailbox_sync_ndr",
    });
    expect(r).toMatchObject({ mode: "skip", statusStamped: false });
    expect(outboundUpdate).not.toHaveBeenCalled();
  });
});

describe("stampOutboundBounce — the statement both channels share", () => {
  it("prefers an explicit providerStatus over the event type", async () => {
    await stampOutboundBounce({
      outbound: { id: "out-7" },
      mode: "apply_status",
      at: AT,
      bounceCategory: "hard",
      providerEventType: "email.bounced",
      providerStatus: "bounced",
    });
    expect(lastCall().data).toMatchObject({
      status: "BOUNCED",
      providerStatus: "bounced",
      lastProviderEventType: "email.bounced",
    });
  });
});
