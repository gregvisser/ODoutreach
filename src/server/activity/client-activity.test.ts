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
    const result = await loadClientActivityTimeline("client-1");
    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.type).toBe("audit");
  });

  it("falls back to generic audit when entityType is UnsubscribeToken but kind is missing", async () => {
    auditFindMany.mockResolvedValue([
      unsubscribeAuditRow({
        metadata: { email: "a@b.co", purpose: "outreach_unsubscribe" },
      }),
    ]);
    const result = await loadClientActivityTimeline("client-1");
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
    const result = await loadClientActivityTimeline("client-1");
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
});
