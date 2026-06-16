import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Call = { model: string; args: { where: Record<string, unknown>; take: number } };

const { calls, state, prismaMock } = vi.hoisted(() => {
  const calls: Call[] = [];
  const state = { rows: [] as unknown[] };
  const fm = (model: string) =>
    vi.fn(async (args: { where: Record<string, unknown>; take: number }) => {
      calls.push({ model, args });
      return state.rows;
    });
  const prismaMock = {
    outboundEmail: { findMany: fm("outboundEmail") },
    inboundReply: { findMany: fm("inboundReply") },
    unsubscribeToken: { findMany: fm("unsubscribeToken") },
    clientEmailSequenceStepSend: { findMany: fm("stepSend") },
  };
  return { calls, state, prismaMock };
});

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

import { loadReportDetail } from "./report-detail";

const WINDOW = {
  gte: new Date("2026-06-01T00:00:00.000Z"),
  lt: new Date("2026-06-08T00:00:00.000Z"),
};

function outboundRow(i: number) {
  return {
    id: `o${i}`,
    toEmail: `r${i}@x.com`,
    subject: "Hi",
    sentAt: new Date("2026-06-02T00:00:00.000Z"),
    status: "SENT",
    clientId: "c1",
    client: { name: "Acme" },
    createdAt: new Date("2026-06-02T00:00:00.000Z"),
    queuedAt: null,
    deliveredAt: null,
    bouncedAt: null,
    openedAt: null,
    bounceCategory: null,
    failureReason: null,
    lastErrorMessage: null,
  };
}

beforeEach(() => {
  calls.length = 0;
  state.rows = [];
  vi.clearAllMocks();
});

describe("loadReportDetail tenant isolation", () => {
  it("throws when a single-client scope is outside the accessible list", async () => {
    await expect(
      loadReportDetail({
        metric: "sent",
        clientId: "intruder",
        accessibleClientIds: ["c1"],
      }),
    ).rejects.toThrow(/FORBIDDEN_CLIENT/);
    expect(calls).toHaveLength(0);
  });

  it("short-circuits to empty when no clients are accessible", async () => {
    const res = await loadReportDetail({
      metric: "sent",
      clientId: null,
      accessibleClientIds: [],
    });
    expect(res).toEqual({ rows: [], truncated: false, cap: 500 });
    expect(calls).toHaveLength(0);
  });

  it("constrains the all-clients scope to the accessible list", async () => {
    await loadReportDetail({
      metric: "sent",
      clientId: null,
      accessibleClientIds: ["c1", "c2"],
    });
    expect(calls[0].args.where.clientId).toEqual({ in: ["c1", "c2"] });
  });
});

describe("loadReportDetail windowed vs state metrics", () => {
  it("applies the date window to an event metric (sent → sentAt)", async () => {
    await loadReportDetail({
      metric: "sent",
      clientId: "c1",
      accessibleClientIds: ["c1"],
      window: WINDOW,
    });
    expect(calls[0].model).toBe("outboundEmail");
    expect(calls[0].args.where.sentAt).toEqual(WINDOW);
  });

  it("ignores the window for a state metric (queued)", async () => {
    await loadReportDetail({
      metric: "queued",
      clientId: "c1",
      accessibleClientIds: ["c1"],
      window: WINDOW,
    });
    const where = calls[0].args.where;
    expect(where.status).toEqual({
      in: ["REQUESTED", "PREPARING", "QUEUED", "PROCESSING"],
    });
    // No date filter of any kind on a "right now" metric.
    for (const k of ["sentAt", "createdAt", "queuedAt", "deliveredAt"]) {
      expect(where[k]).toBeUndefined();
    }
  });

  it("suppressed excludes cooldown deferrals and ignores the window", async () => {
    await loadReportDetail({
      metric: "suppressed",
      clientId: "c1",
      accessibleClientIds: ["c1"],
      window: WINDOW,
    });
    const where = calls[0].args.where;
    expect(calls[0].model).toBe("stepSend");
    expect(where.status).toEqual({ in: ["SUPPRESSED", "SKIPPED", "BLOCKED"] });
    expect(where.NOT).toEqual({
      blockedReason: { contains: "cooldown", mode: "insensitive" },
    });
  });
});

describe("loadReportDetail row mapping", () => {
  it("links a reply row to its reply-detail page", async () => {
    state.rows = [
      {
        id: "rep1",
        fromEmail: "prospect@x.com",
        subject: null,
        snippet: "thanks",
        receivedAt: new Date("2026-06-03T00:00:00.000Z"),
        clientId: "c1",
        client: { name: "Acme" },
      },
    ];
    const res = await loadReportDetail({
      metric: "replies",
      clientId: "c1",
      accessibleClientIds: ["c1"],
    });
    expect(calls[0].model).toBe("inboundReply");
    expect(res.rows[0]).toMatchObject({
      email: "prospect@x.com",
      subject: "thanks", // falls back to snippet when subject is null
      href: "/clients/c1/activity/replies/rep1",
    });
  });

  it("caps the list and flags truncation", async () => {
    state.rows = Array.from({ length: 501 }, (_, i) => outboundRow(i));
    const res = await loadReportDetail({
      metric: "sent",
      clientId: "c1",
      accessibleClientIds: ["c1"],
    });
    expect(res.truncated).toBe(true);
    expect(res.rows).toHaveLength(500);
    expect(calls[0].args.take).toBe(501);
  });
});
