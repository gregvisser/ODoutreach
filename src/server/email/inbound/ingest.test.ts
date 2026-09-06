import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * M8 — the legacy ESP-webhook ingest (`ingestInboundForClient`) must enforce
 * the same two safety gates the mailbox-sync reply path already has:
 *   1. F4 internal-mail filter (both ends on a workspace domain → never store).
 *   2. Reply de-dup by providerMessageId (an ESP retries its webhook, so the
 *      same message can arrive twice).
 *
 * `isInternalMail` and `normalizeEmail` run for real here — we mock only the
 * I/O boundaries (Prisma, the internal-domains resolver, the follow-up stop).
 */
const {
  inboundFindFirst,
  inboundCreate,
  outboundFindFirst,
  outboundUpdate,
  contactFindFirst,
  resolveInternalDomains,
  stopFollowUps,
  classifyReply,
} = vi.hoisted(() => ({
  inboundFindFirst: vi.fn(),
  inboundCreate: vi.fn(),
  outboundFindFirst: vi.fn(),
  outboundUpdate: vi.fn(),
  contactFindFirst: vi.fn(),
  resolveInternalDomains: vi.fn(),
  stopFollowUps: vi.fn(),
  classifyReply: vi.fn(),
}));

vi.mock("@/lib/db", () => {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ value: 1 }]),
    inboundReply: {
      findFirst: (...a: unknown[]) => inboundFindFirst(...a),
      create: (...a: unknown[]) => inboundCreate(...a),
    },
    outboundEmail: {
      findFirst: (...a: unknown[]) => outboundFindFirst(...a),
      updateMany: (...a: unknown[]) => outboundUpdate(...a),
      findUnique: vi.fn(async ({ where }) => ({ id: where.id, status: "SENT" })),
    },
    contact: { findFirst: (...a: unknown[]) => contactFindFirst(...a) },
  };
  return { prisma: { ...tx, $transaction: (fn: (db: typeof tx) => Promise<unknown>) => fn(tx) } };
});

vi.mock("@/server/inbox/internal-domains", () => ({
  resolveInternalDomainsForClient: (...a: unknown[]) => resolveInternalDomains(...a),
}));

vi.mock("@/server/email-sequences/stop-follow-ups-on-reply", () => ({
  stopFollowUpsForLinkedReply: (...a: unknown[]) => stopFollowUps(...a),
}));

vi.mock("@/server/ai/classify-inbound-reply", () => ({
  classifyInboundReplyQuietly: (...a: unknown[]) => classifyReply(...a),
}));

import { ingestInboundForClient } from "./ingest";

beforeEach(() => {
  inboundFindFirst.mockReset();
  inboundCreate.mockReset();
  outboundFindFirst.mockReset();
  outboundUpdate.mockReset();
  contactFindFirst.mockReset();
  resolveInternalDomains.mockReset();
  stopFollowUps.mockReset();
  classifyReply.mockReset().mockResolvedValue(undefined);
  // Defaults for the happy path: filter off, nothing matched, create returns a row.
  resolveInternalDomains.mockResolvedValue([]);
  outboundFindFirst.mockResolvedValue(null);
  contactFindFirst.mockResolvedValue(null);
  inboundFindFirst.mockResolvedValue(null);
  inboundCreate.mockResolvedValue({ id: "new-reply-1" });
});

describe("ingestInboundForClient — M8 gates", () => {
  it("F4: skips internal staff mail (both ends on a workspace domain) without storing it", async () => {
    resolveInternalDomains.mockResolvedValue(["acme.com"]);

    const res = await ingestInboundForClient({
      clientId: "client-1",
      payload: {
        fromEmail: "Alice@Acme.com",
        toEmail: "bob@acme.com",
        providerMessageId: "pm-internal",
      },
      ingestionSource: "webhook",
    });

    expect(res).toEqual({
      id: null,
      matchMethod: "UNLINKED",
      skipped: "internal_mail",
    });
    expect(inboundCreate).not.toHaveBeenCalled();
    expect(outboundUpdate).not.toHaveBeenCalled();
    expect(stopFollowUps).not.toHaveBeenCalled();
    // The dedup lookup must not even run once we've classified it internal.
    expect(inboundFindFirst).not.toHaveBeenCalled();
  });

  it("F4 is conservative: an external sender to an internal recipient is NOT internal", async () => {
    resolveInternalDomains.mockResolvedValue(["acme.com"]);

    const res = await ingestInboundForClient({
      clientId: "client-1",
      payload: {
        fromEmail: "prospect@external.com",
        toEmail: "rep@acme.com",
        providerMessageId: "pm-real",
      },
      ingestionSource: "webhook",
    });

    expect(res.skipped).toBeUndefined();
    expect(inboundCreate).toHaveBeenCalledTimes(1);
  });

  it("de-dup: an existing reply for this providerMessageId is returned untouched", async () => {
    inboundFindFirst.mockResolvedValue({
      id: "existing-reply",
      matchMethod: "BY_CONTACT_EMAIL",
    });

    const res = await ingestInboundForClient({
      clientId: "client-1",
      payload: {
        fromEmail: "prospect@external.com",
        providerMessageId: "pm-dupe",
      },
      ingestionSource: "webhook",
    });

    expect(res).toEqual({
      id: "existing-reply",
      matchMethod: "BY_CONTACT_EMAIL",
      skipped: "duplicate",
    });
    // No new row, no re-running of the REPLIED / stop-follow-ups side effects.
    expect(inboundCreate).not.toHaveBeenCalled();
    expect(outboundUpdate).not.toHaveBeenCalled();
    expect(stopFollowUps).not.toHaveBeenCalled();
  });

  it("happy path: a fresh external reply is stored (UNLINKED when nothing matches)", async () => {
    const res = await ingestInboundForClient({
      clientId: "client-1",
      payload: {
        fromEmail: "prospect@external.com",
        toEmail: "rep@acme.com",
        providerMessageId: "pm-fresh",
      },
      ingestionSource: "webhook",
    });

    expect(res).toEqual({ id: "new-reply-1", matchMethod: "UNLINKED" });
    expect(inboundCreate).toHaveBeenCalledTimes(1);
    // The dedup lookup ran but found nothing, so we proceeded to create.
    expect(inboundFindFirst).toHaveBeenCalledTimes(1);
  });

  /**
   * Row 80 — the classification wiring, proven to FIRE rather than to exist.
   *
   * The queue records six features this project shipped that were built, wired,
   * reported success and never actually ran. A classifier that is never called
   * is indistinguishable from one that is: both leave every reply unlabelled.
   */
  it("classifies the stored reply, including an UNLINKED one nobody is watching", async () => {
    await ingestInboundForClient({
      clientId: "client-1",
      payload: {
        fromEmail: "prospect@external.com",
        toEmail: "rep@acme.com",
        providerMessageId: "pm-fresh",
      },
      ingestionSource: "webhook",
    });

    expect(classifyReply).toHaveBeenCalledTimes(1);
    expect(classifyReply).toHaveBeenCalledWith({ replyId: "new-reply-1" });
  });

  it("never classifies a message that was not stored", async () => {
    resolveInternalDomains.mockResolvedValue(["acme.com"]);

    await ingestInboundForClient({
      clientId: "client-1",
      payload: { fromEmail: "staff@acme.com", toEmail: "rep@acme.com" },
      ingestionSource: "webhook",
    });

    // Internal staff mail creates no reply row, so there is nothing to label
    // and nothing may be charged to the client for it.
    expect(classifyReply).not.toHaveBeenCalled();
  });
});
