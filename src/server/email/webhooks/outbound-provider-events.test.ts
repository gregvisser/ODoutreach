import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// --- Prisma mock -----------------------------------------------------------
const {
  providerEventCreate,
  providerEventUpdateMany,
  outboundFindFirst,
  outboundUpdate,
} = vi.hoisted(() => ({
  providerEventCreate: vi.fn(),
  providerEventUpdateMany: vi.fn(),
  outboundFindFirst: vi.fn(),
  outboundUpdate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    outboundProviderEvent: {
      create: (...a: unknown[]) => providerEventCreate(...a),
      updateMany: (...a: unknown[]) => providerEventUpdateMany(...a),
    },
    outboundEmail: {
      findFirst: (...a: unknown[]) => outboundFindFirst(...a),
      update: (...a: unknown[]) => outboundUpdate(...a),
    },
  },
}));

// Spy on the suppression writer — its own behaviour is tested separately.
const { suppressSpy } = vi.hoisted(() => ({ suppressSpy: vi.fn() }));
vi.mock("@/server/email/bounce-suppression", () => ({
  suppressRecipientForHardBounce: (...a: unknown[]) => suppressSpy(...a),
}));

// Deterministic dedupe hash so we don't depend on the hashing impl.
vi.mock("./webhook-dedupe", () => ({
  computeWebhookDedupeHash: () => "dedupe-1",
}));

import { applyNormalizedEmailEvent } from "./outbound-provider-events";

const CREATED_AT = new Date("2026-06-14T12:00:00.000Z");

function bounceEvent(over: Record<string, unknown> = {}) {
  return {
    providerName: "resend",
    providerMessageId: "pm-1",
    eventType: "email.bounced",
    createdAt: CREATED_AT,
    bounceCategory: "Permanent",
    bounceType: "Permanent",
    providerStatus: "email.bounced",
    rawPayload: { type: "email.bounced" },
    webhookMessageId: "svix-1",
    ...over,
  };
}

function outboundRow(over: Record<string, unknown> = {}) {
  return {
    id: "out-1",
    clientId: "client-1",
    contactId: "ct-1",
    toEmail: "dead@example.com",
    status: "SENT",
    lastProviderEventAt: null,
    ...over,
  };
}

let savedFlag: string | undefined;
beforeEach(() => {
  savedFlag = process.env.BOUNCE_SUPPRESSION_ENABLED;
  providerEventCreate.mockReset().mockResolvedValue({});
  providerEventUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  outboundFindFirst.mockReset().mockResolvedValue(outboundRow());
  outboundUpdate.mockReset().mockResolvedValue({});
  suppressSpy.mockReset().mockResolvedValue({
    suppressed: true,
    newlyCreated: true,
    normalizedEmail: "dead@example.com",
    contactsFlagged: 1,
  });
  // Flag ON by default for these tests; individual tests override.
  process.env.BOUNCE_SUPPRESSION_ENABLED = "true";
});
afterAll(() => {
  if (savedFlag === undefined) delete process.env.BOUNCE_SUPPRESSION_ENABLED;
  else process.env.BOUNCE_SUPPRESSION_ENABLED = savedFlag;
});

describe("applyNormalizedEmailEvent — hard-bounce suppression", () => {
  it("marks BOUNCED and suppresses the recipient on a permanent bounce", async () => {
    const res = await applyNormalizedEmailEvent(bounceEvent());

    // Status applied.
    expect(outboundUpdate).toHaveBeenCalledTimes(1);
    expect(outboundUpdate.mock.calls[0][0]).toMatchObject({
      where: { id: "out-1" },
      data: { status: "BOUNCED" },
    });

    // Suppression invoked with the recipient + tenant + audit context.
    expect(suppressSpy).toHaveBeenCalledTimes(1);
    expect(suppressSpy.mock.calls[0][0]).toEqual({
      clientId: "client-1",
      email: "dead@example.com",
      contactId: "ct-1",
      outboundEmailId: "out-1",
      bounceCategory: "Permanent",
      providerEventType: "email.bounced",
      at: CREATED_AT,
    });

    expect(res).toMatchObject({ applied: true, outboundEmailId: "out-1" });
  });

  it("does NOT suppress a soft / transient bounce (still marks BOUNCED)", async () => {
    await applyNormalizedEmailEvent(
      bounceEvent({ bounceType: "Transient", bounceCategory: "Transient" }),
    );

    expect(outboundUpdate.mock.calls[0][0]).toMatchObject({
      data: { status: "BOUNCED" },
    });
    expect(suppressSpy).not.toHaveBeenCalled();
  });

  it("does NOT suppress an 'Undetermined' bounce", async () => {
    await applyNormalizedEmailEvent(
      bounceEvent({ bounceType: "Undetermined", bounceCategory: "Undetermined" }),
    );
    expect(suppressSpy).not.toHaveBeenCalled();
  });

  it("does NOT suppress when the feature flag is OFF (still marks BOUNCED)", async () => {
    process.env.BOUNCE_SUPPRESSION_ENABLED = "false";

    await applyNormalizedEmailEvent(bounceEvent());

    expect(outboundUpdate.mock.calls[0][0]).toMatchObject({
      data: { status: "BOUNCED" },
    });
    expect(suppressSpy).not.toHaveBeenCalled();
  });

  it("does NOT suppress when the bounce is out-of-order vs a REPLIED milestone", async () => {
    // REPLIED beats an out-of-order bounce → plan.mode === 'skip'.
    outboundFindFirst.mockResolvedValue(outboundRow({ status: "REPLIED" }));

    await applyNormalizedEmailEvent(bounceEvent());

    expect(outboundUpdate).not.toHaveBeenCalled();
    expect(suppressSpy).not.toHaveBeenCalled();
  });

  it("suppresses on a metadata-only refresh of an already-BOUNCED row (idempotent)", async () => {
    outboundFindFirst.mockResolvedValue(outboundRow({ status: "BOUNCED" }));

    await applyNormalizedEmailEvent(bounceEvent());

    // metadata-only path still runs suppression (it is idempotent).
    expect(suppressSpy).toHaveBeenCalledTimes(1);
  });

  it("is a no-op on a replayed webhook (dedupe P2002) — never suppresses twice", async () => {
    providerEventCreate.mockRejectedValue({ code: "P2002" });

    const res = await applyNormalizedEmailEvent(bounceEvent());

    expect(res).toMatchObject({ applied: false, replayDuplicate: true });
    expect(outboundFindFirst).not.toHaveBeenCalled();
    expect(suppressSpy).not.toHaveBeenCalled();
  });

  it("does not suppress when no outbound matches the provider message id", async () => {
    outboundFindFirst.mockResolvedValue(null);

    const res = await applyNormalizedEmailEvent(bounceEvent());

    expect(res).toMatchObject({ applied: false });
    expect(suppressSpy).not.toHaveBeenCalled();
  });
});
