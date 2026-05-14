import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PR O — tests for the AuditLog → unsubscribe event mapping inside
 * `loadClientActivityTimeline`. Every other prisma source is stubbed
 * to return `[]` so the assertions stay focused on the AuditLog
 * branch. The mock is hoisted so `vi.mock` can wire it up before the
 * loader module is imported.
 */
const {
  outboundFindMany,
  inboundReplyFindMany,
  inboundMessageFindMany,
  importFindMany,
  listFindMany,
  templateFindMany,
  sequenceFindMany,
  enrollmentFindMany,
  stepSendFindMany,
  auditFindMany,
} = vi.hoisted(() => ({
  outboundFindMany: vi.fn().mockResolvedValue([]),
  inboundReplyFindMany: vi.fn().mockResolvedValue([]),
  inboundMessageFindMany: vi.fn().mockResolvedValue([]),
  importFindMany: vi.fn().mockResolvedValue([]),
  listFindMany: vi.fn().mockResolvedValue([]),
  templateFindMany: vi.fn().mockResolvedValue([]),
  sequenceFindMany: vi.fn().mockResolvedValue([]),
  enrollmentFindMany: vi.fn().mockResolvedValue([]),
  stepSendFindMany: vi.fn().mockResolvedValue([]),
  auditFindMany: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    outboundEmail: { findMany: outboundFindMany },
    inboundReply: { findMany: inboundReplyFindMany },
    inboundMailboxMessage: { findMany: inboundMessageFindMany },
    contactImportBatch: { findMany: importFindMany },
    contactList: { findMany: listFindMany },
    clientEmailTemplate: { findMany: templateFindMany },
    clientEmailSequence: { findMany: sequenceFindMany },
    clientEmailSequenceEnrollment: { findMany: enrollmentFindMany },
    clientEmailSequenceStepSend: { findMany: stepSendFindMany },
    auditLog: { findMany: auditFindMany },
  },
}));

import { loadClientActivityTimeline } from "./client-activity";

function unsubscribeAuditRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "audit-u1",
    action: "UPDATE",
    entityType: "UnsubscribeToken",
    entityId: "tok-1",
    createdAt: new Date("2026-04-22T12:34:56Z"),
    metadata: {
      kind: "recipient_unsubscribed",
      email: "alex@bidlow.co.uk",
      emailDomain: "bidlow.co.uk",
      contactId: "contact-1",
      outboundEmailId: "out-1",
      purpose: "outreach_unsubscribe",
    },
    staffUser: null,
    ...overrides,
  };
}

describe("loadClientActivityTimeline — unsubscribe audit mapping (PR O)", () => {
  beforeEach(() => {
    for (const m of [
      outboundFindMany,
      inboundReplyFindMany,
      inboundMessageFindMany,
      importFindMany,
      listFindMany,
      templateFindMany,
      sequenceFindMany,
      enrollmentFindMany,
      stepSendFindMany,
      auditFindMany,
    ]) {
      m.mockReset();
      m.mockResolvedValue([]);
    }
  });

  it("maps an UnsubscribeToken audit row to an unsubscribe timeline event", async () => {
    auditFindMany.mockResolvedValue([unsubscribeAuditRow()]);

    const result = await loadClientActivityTimeline("client-1");
    expect(result.events).toHaveLength(1);
    const evt = result.events[0]!;
    expect(evt.id).toBe("audit:audit-u1");
    expect(evt.type).toBe("unsubscribe");
    expect(evt.severity).toBe("warning");
    expect(evt.title).toBe("Recipient unsubscribed");
    expect(evt.actorLabel).toBe("Unsubscribe link");
    expect(evt.sourceModel).toBe("AuditLog");
    expect(result.summary.byType.unsubscribe).toBe(1);
    expect(result.summary.warnings).toBe(1);
  });

  it("masks the recipient email in the description (never leaks the raw address)", async () => {
    auditFindMany.mockResolvedValue([unsubscribeAuditRow()]);
    const result = await loadClientActivityTimeline("client-1");
    const desc = result.events[0]!.description ?? "";
    expect(desc).toContain("a***@bidlow.co.uk");
    expect(desc).not.toContain("alex@bidlow.co.uk");
  });

  it("falls back to '(unknown recipient)' when metadata has no email", async () => {
    auditFindMany.mockResolvedValue([
      unsubscribeAuditRow({
        metadata: { kind: "recipient_unsubscribed" },
      }),
    ]);
    const result = await loadClientActivityTimeline("client-1");
    expect(result.events[0]!.description).toContain("(unknown recipient)");
  });

  it("does not crash when metadata is null, still renders a generic audit row", async () => {
    auditFindMany.mockResolvedValue([
      unsubscribeAuditRow({ metadata: null }),
    ]);
    const result = await loadClientActivityTimeline("client-1", { mode: "all" });
    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.type).toBe("audit");
  });

  it("falls back to generic audit when entityType is UnsubscribeToken but kind is missing", async () => {
    auditFindMany.mockResolvedValue([
      unsubscribeAuditRow({
        metadata: { email: "a@b.co", purpose: "outreach_unsubscribe" },
      }),
    ]);
    const result = await loadClientActivityTimeline("client-1", { mode: "all" });
    expect(result.events[0]!.type).toBe("audit");
  });

  it("ignores non-UnsubscribeToken audits and keeps them as generic audit events", async () => {
    auditFindMany.mockResolvedValue([
      {
        id: "audit-other",
        action: "UPDATE",
        entityType: "Client",
        entityId: "c1",
        createdAt: new Date("2026-04-22T11:00:00Z"),
        metadata: { kind: "whatever" },
        staffUser: { displayName: "Ada", email: "ada@example.com" },
      },
    ]);
    const result = await loadClientActivityTimeline("client-1", { mode: "all" });
    expect(result.events[0]!.type).toBe("audit");
    expect(result.events[0]!.title).toBe("UPDATE · Client");
  });

  it("keeps sort order and co-exists with other sources (unsubscribe newer => comes first)", async () => {
    auditFindMany.mockResolvedValue([
      unsubscribeAuditRow({
        id: "audit-u2",
        createdAt: new Date("2026-04-22T12:00:00Z"),
      }),
    ]);
    outboundFindMany.mockResolvedValue([
      {
        id: "out-x",
        status: "SENT",
        subject: "hi",
        toEmail: "x@y.co",
        fromAddress: "f@z.co",
        lastErrorMessage: null,
        sentAt: new Date("2026-04-22T10:00:00Z"),
        bouncedAt: null,
        queuedAt: null,
        createdAt: new Date("2026-04-22T09:59:00Z"),
        failureReason: null,
        metadata: null,
      },
    ]);
    const result = await loadClientActivityTimeline("client-1");
    expect(result.events.map((e) => e.id)).toEqual([
      "audit:audit-u2",
      "outbound:out-x",
    ]);
  });

  it("keeps generic audit and mailbox setup events out of the default outreach timeline", async () => {
    outboundFindMany.mockResolvedValue([
      {
        id: "out-x",
        status: "SENT",
        subject: "hi",
        toEmail: "x@y.co",
        fromAddress: "f@z.co",
        lastErrorMessage: null,
        sentAt: new Date("2026-04-22T10:00:00Z"),
        bouncedAt: null,
        queuedAt: null,
        createdAt: new Date("2026-04-22T09:59:00Z"),
        failureReason: null,
        metadata: null,
      },
    ]);
    auditFindMany.mockResolvedValue([
      unsubscribeAuditRow({ id: "audit-unsub" }),
      {
        id: "audit-mailbox",
        action: "UPDATE",
        entityType: "ClientMailboxIdentity",
        entityId: "mbx-1",
        createdAt: new Date("2026-04-22T11:00:00Z"),
        metadata: {},
        staffUser: { displayName: "Ada", email: "ada@example.com" },
      },
      {
        id: "audit-other",
        action: "UPDATE",
        entityType: "Client",
        entityId: "c1",
        createdAt: new Date("2026-04-22T10:30:00Z"),
        metadata: {},
        staffUser: { displayName: "Ada", email: "ada@example.com" },
      },
    ]);

    const result = await loadClientActivityTimeline("client-1");

    expect(result.events.map((e) => e.id)).toEqual([
      "audit:audit-unsub",
      "outbound:out-x",
    ]);
    expect(result.events.map((e) => e.type)).toEqual(["unsubscribe", "send"]);
  });

  it("scopes the audit query by clientId (regression guard against cross-client leak)", async () => {
    await loadClientActivityTimeline("client-42");
    expect(auditFindMany).toHaveBeenCalledTimes(1);
    const arg = auditFindMany.mock.calls[0]![0] as { where: { clientId: string } };
    expect(arg.where.clientId).toBe("client-42");
  });

  it("returns an empty result without calling prisma when clientId is empty", async () => {
    const result = await loadClientActivityTimeline("");
    expect(result.events).toEqual([]);
    expect(auditFindMany).not.toHaveBeenCalled();
  });

  it("excludes inbound_message events from default outreach timeline (PR #130)", async () => {
    inboundMessageFindMany.mockResolvedValue([
      {
        id: "imsg-1",
        fromEmail: "random@timetastic.co.uk",
        subject: "Leave approved",
        receivedAt: new Date("2026-05-13T09:00:00Z"),
        mailboxIdentityId: "mbx-1",
      },
    ]);
    outboundFindMany.mockResolvedValue([
      {
        id: "out-1",
        status: "SENT",
        subject: "Intro email",
        toEmail: "prospect@corp.com",
        fromAddress: "adam@client.com",
        lastErrorMessage: null,
        sentAt: new Date("2026-05-13T08:00:00Z"),
        bouncedAt: null,
        queuedAt: null,
        createdAt: new Date("2026-05-13T07:59:00Z"),
        failureReason: null,
        metadata: null,
      },
    ]);

    const outreach = await loadClientActivityTimeline("client-1", { mode: "outreach" });
    expect(outreach.events.map((e) => e.type)).not.toContain("inbound_message");
    expect(outreach.events.map((e) => e.type)).toContain("send");

    const all = await loadClientActivityTimeline("client-1", { mode: "all" });
    expect(all.events.map((e) => e.type)).toContain("inbound_message");
    expect(all.events.map((e) => e.type)).toContain("send");
  });

  it("includes linked InboundReply events in outreach timeline (PR #130)", async () => {
    inboundReplyFindMany.mockResolvedValue([
      {
        id: "reply-1",
        fromEmail: "prospect@corp.com",
        subject: "Re: Intro",
        receivedAt: new Date("2026-05-13T10:00:00Z"),
        matchMethod: "BY_OUTBOUND_PROVIDER_ID",
        linkedOutboundEmailId: "out-1",
      },
    ]);

    const outreach = await loadClientActivityTimeline("client-1", { mode: "outreach" });
    expect(outreach.events.map((e) => e.type)).toContain("reply");
    expect(outreach.events).toHaveLength(1);
  });

  it("excludes unlinked InboundReply from outreach timeline with info severity (PR #130)", async () => {
    inboundReplyFindMany.mockResolvedValue([
      {
        id: "reply-unlinked",
        fromEmail: "random@somewhere.com",
        subject: "Something unrelated",
        receivedAt: new Date("2026-05-13T10:00:00Z"),
        matchMethod: "UNLINKED",
        linkedOutboundEmailId: null,
      },
    ]);

    const outreach = await loadClientActivityTimeline("client-1", { mode: "outreach" });
    const replyEvents = outreach.events.filter((e) => e.type === "reply");
    expect(replyEvents).toHaveLength(1);
    expect(replyEvents[0]!.severity).toBe("info");
  });
});
