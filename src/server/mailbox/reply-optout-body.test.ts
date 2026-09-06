import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Opt-out detection must see the WHOLE email, not a preview of it.
 *
 * Found 2026-08-24 while tracing why NDR detection never fired. The bounce path
 * already does the right thing — mailbox-inbox-sync passes
 * `row.fullBody?.bodyText ?? row.bodyPreview ?? row.snippet` to the bounce
 * classifier. Sixty-five lines later the REPLY path passes only
 * `snippet`/`bodyPreview`, and `processSyncedMessageForReply` hands that same
 * truncated string to `suppressReplyOptOut`. The full body was fetched, was in
 * memory, and was thrown away.
 *
 * Measured on production the same day: Microsoft messages average 4,023
 * characters of bodyText against a 242-character preview. So opt-out detection
 * has been reading roughly 6% of the email.
 *
 * Why this one matters more than the bounce gap: an opt-out is a legal
 * obligation under PECR however it arrives, and "please take me off your list"
 * is very often the second or third paragraph — below any preview. Reply
 * MATCHING is unaffected (it uses headers and subject, never the body), so the
 * commercial leg was fine; it is the compliance leg that was starved.
 */

const prismaMock = vi.hoisted(() => ({
  inboundReply: { findFirst: vi.fn(), create: vi.fn() },
  outboundEmail: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(async ({ where }) => ({ id: where.id, status: "SENT" })) },
}));

const suppressReplyOptOutMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("@/lib/db", () => {
  const tx = { ...prismaMock, $queryRaw: vi.fn().mockResolvedValue([{ value: 1 }]) };
  return { prisma: { ...prismaMock, $transaction: (fn: (db: typeof tx) => Promise<unknown>) => fn(tx) } };
});
vi.mock("@/lib/normalize", () => ({
  normalizeEmail: (e: string) => e.toLowerCase().trim(),
  canonicalizeEmailForMatching: (e: string) => {
    const n = e.toLowerCase().trim();
    const at = n.indexOf("@");
    if (at < 0) return n;
    return `${n.slice(0, at).split("+")[0]}${n.slice(at)}`;
  },
}));
vi.mock("@/server/email/outbound/lifecycle", () => ({
  canApplyReplyMilestone: () => false,
}));
vi.mock("@/server/email-sequences/stop-follow-ups-on-reply", () => ({
  stopFollowUpsForLinkedReply: vi.fn().mockResolvedValue({ enrollmentsStopped: 0 }),
}));
vi.mock("@/server/mailbox/opt-out-detection", () => ({
  suppressReplyOptOut: (...a: unknown[]) => suppressReplyOptOutMock(...a),
}));

import { processSyncedMessageForReply } from "./process-synced-replies";

/** A real opt-out, sitting where they usually sit: past the preview. */
const PREVIEW = "Thanks for getting in touch about the catering options, that all";
const FULL_BODY = `${PREVIEW} sounds interesting and I appreciate you reaching out.

Having discussed it internally though, we are not looking at this right now.

Please remove me from your mailing list and do not contact me again.

Kind regards,
Sam`;

beforeEach(() => {
  suppressReplyOptOutMock.mockClear();
  prismaMock.inboundReply.findFirst.mockResolvedValue(null);
  prismaMock.inboundReply.create.mockResolvedValue({ id: "reply-1" });
  prismaMock.outboundEmail.findFirst.mockResolvedValue(null);
  prismaMock.outboundEmail.findMany.mockResolvedValue([
    {
      id: "outbound-1",
      contactId: "contact-1",
      status: "SENT",
      toEmail: "sam@example.com",
    },
  ]);
});

const baseInput = {
  clientId: "client-1",
  mailboxIdentityId: "mailbox-1",
  providerMessageId: "msg-1",
  fromEmail: "sam@example.com",
  toEmail: "outreach@client.co.uk",
  subject: "Re: Catering Options",
  snippet: PREVIEW,
  bodyPreview: PREVIEW,
  receivedAt: new Date("2026-08-24T10:00:00Z"),
  conversationId: null,
  inReplyToHeader: null,
  internalDomains: [] as string[],
  requireThreadRefSenderMatch: false,
};

describe("opt-out detection is given the full body when one was fetched", () => {
  it("passes bodyText through, not the preview", async () => {
    await processSyncedMessageForReply({ ...baseInput, bodyText: FULL_BODY });

    expect(suppressReplyOptOutMock).toHaveBeenCalledTimes(1);
    const passed = suppressReplyOptOutMock.mock.calls[0][0] as { bodyText?: string };
    expect(passed.bodyText).toBe(FULL_BODY);
    // The removal request lives past the preview — this is the whole point.
    expect(passed.bodyText).toContain("Please remove me from your mailing list");
  });

  it("falls back to the preview when no body was fetched — Gmail's case today", async () => {
    await processSyncedMessageForReply({ ...baseInput, bodyText: null });

    const passed = suppressReplyOptOutMock.mock.calls[0][0] as { bodyText?: string };
    expect(passed.bodyText).toBe(PREVIEW);
  });

  it("falls back to the snippet when there is neither body nor preview", async () => {
    await processSyncedMessageForReply({
      ...baseInput,
      bodyText: null,
      bodyPreview: null,
    });

    const passed = suppressReplyOptOutMock.mock.calls[0][0] as { bodyText?: string };
    expect(passed.bodyText).toBe(PREVIEW);
  });
});
