import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, callAnthropicMock } = vi.hoisted(() => ({
  prismaMock: {
    client: { findFirst: vi.fn() },
    outboundEmail: { findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    clientEmailSequenceStep: { update: vi.fn(), updateMany: vi.fn() },
    aiSendTimeAdvice: { create: vi.fn(), findFirst: vi.fn() },
    aiUsageEvent: { create: vi.fn() },
  },
  callAnthropicMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/lib/logger", () => ({
  reportError: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("./anthropic-messages", () => ({
  callAnthropicMessages: callAnthropicMock,
  AI_CALL_TIMEOUT_MS: 20_000,
}));

import {
  SEND_TIME_ADVICE_PROMPT_VERSION,
  SEND_TIME_ADVICE_TOOL,
} from "@/lib/ai/send-time-advice";
import { LOOKBACK_DAYS } from "@/lib/ai/send-time-evidence";

import { adviseSendTimes, loadLatestSendTimeAdvice } from "./advise-send-times";

const CLIENT = {
  id: "client-1",
  slug: "acme-safety",
  name: "Acme Safety",
  industry: "Health and safety",
};

const NOW = new Date("2026-08-29T10:00:00Z");

const GOOD_ADVICE = {
  summary: "Monday and Tuesday mornings are ahead; the rest is noise.",
  windows: [
    { weekday: 1, startHour: 9, endHour: 11, reason: "Best rate in your table." },
  ],
  cautions: ["Only 180 days of history."],
};

/** Enough sends, replies and spread to pass the evidence gate. */
function healthyHistory(): { sentAt: Date; _count: { inboundReplies: number } }[] {
  const rows: { sentAt: Date; _count: { inboundReplies: number } }[] = [];
  const days = [
    "2026-07-13T08:30:00Z",
    "2026-07-14T09:30:00Z",
    "2026-07-15T10:30:00Z",
    "2026-07-16T13:30:00Z",
  ];
  for (const iso of days) {
    for (let i = 0; i < 100; i += 1) {
      rows.push({ sentAt: new Date(iso), _count: { inboundReplies: i < 8 ? 1 : 0 } });
    }
  }
  return rows;
}

function anthropicReturns(input: unknown): void {
  callAnthropicMock.mockResolvedValue({
    content: [{ type: "tool_use", name: SEND_TIME_ADVICE_TOOL.name, input }],
    inputTokens: 900,
    outputTokens: 210,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.client.findFirst.mockResolvedValue(CLIENT);
  prismaMock.outboundEmail.findMany.mockResolvedValue(healthyHistory());
  prismaMock.aiSendTimeAdvice.create.mockResolvedValue({ id: "advice-1" });
  prismaMock.aiUsageEvent.create.mockResolvedValue({ id: "usage-1" });
  anthropicReturns(GOOD_ADVICE);
  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.AI_FEATURES_ENABLED = "true";
});

describe("adviseSendTimes", () => {
  it("advises, and returns the evidence alongside the opinion", async () => {
    const result = await adviseSendTimes({
      clientId: "client-1",
      staffUserId: "staff-1",
      now: NOW,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.summary).toContain("Monday");
    expect(result.windows).toHaveLength(1);
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  it("SPENDS NOTHING when the history is too thin", async () => {
    // The gate, and the reason it is before the call rather than after it.
    prismaMock.outboundEmail.findMany.mockResolvedValue([
      { sentAt: new Date("2026-07-14T09:30:00Z"), _count: { inboundReplies: 1 } },
    ]);

    const result = await adviseSendTimes({
      clientId: "client-1",
      staffUserId: "staff-1",
      now: NOW,
    });

    expect(result.ok).toBe(false);
    expect(callAnthropicMock).not.toHaveBeenCalled();
    // Not even a REFUSED ledger row: no call was contemplated, so there is no
    // call to record. A row here would make the spend screen show attempts that
    // never happened.
    expect(prismaMock.aiUsageEvent.create).not.toHaveBeenCalled();
    expect(prismaMock.aiSendTimeAdvice.create).not.toHaveBeenCalled();
  });

  it("tells the operator WHICH thing is missing, not just 'not enough data'", async () => {
    prismaMock.outboundEmail.findMany.mockResolvedValue([]);
    const result = await adviseSendTimes({
      clientId: "client-1",
      staffUserId: "staff-1",
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toContain("sends");
  });

  it("changes NOTHING about when anything is sent", async () => {
    await adviseSendTimes({ clientId: "client-1", staffUserId: "staff-1", now: NOW });

    // The whole safety claim of this feature, asserted rather than asserted-in-prose.
    expect(prismaMock.outboundEmail.update).not.toHaveBeenCalled();
    expect(prismaMock.outboundEmail.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.clientEmailSequenceStep.update).not.toHaveBeenCalled();
    expect(prismaMock.clientEmailSequenceStep.updateMany).not.toHaveBeenCalled();
  });

  it("reads only this client's mail, so one tenant cannot bill for another's", async () => {
    await adviseSendTimes({ clientId: "client-1", staffUserId: "staff-1", now: NOW });
    const where = prismaMock.outboundEmail.findMany.mock.calls[0]?.[0]?.where as {
      clientId?: string;
    };
    expect(where.clientId).toBe("client-1");
  });

  it("bounds the history to the lookback window", async () => {
    await adviseSendTimes({ clientId: "client-1", staffUserId: "staff-1", now: NOW });
    const where = prismaMock.outboundEmail.findMany.mock.calls[0]?.[0]?.where as {
      sentAt?: { gte?: Date };
    };
    const expected = new Date(NOW.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    expect(where.sentAt?.gte?.getTime()).toBe(expected.getTime());
  });

  it("refuses a soft-deleted workspace", async () => {
    prismaMock.client.findFirst.mockResolvedValue(null);
    const result = await adviseSendTimes({
      clientId: "client-1",
      staffUserId: "staff-1",
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("client_not_found");
    expect(callAnthropicMock).not.toHaveBeenCalled();
    const where = prismaMock.client.findFirst.mock.calls[0]?.[0]?.where as {
      deletedAt?: null;
    };
    expect(where.deletedAt).toBeNull();
  });

  it("bills the tokens even when the answer is unusable", async () => {
    callAnthropicMock.mockResolvedValue({
      content: [{ type: "text", text: "I would rather not." }],
      inputTokens: 900,
      outputTokens: 12,
    });

    const result = await adviseSendTimes({
      clientId: "client-1",
      staffUserId: "staff-1",
      now: NOW,
    });

    expect(result.ok).toBe(false);
    // The tokens were spent, so they are on the ledger. Nothing is stored as
    // advice, because there is no advice.
    const usage = prismaMock.aiUsageEvent.create.mock.calls[0]?.[0]?.data as {
      inputTokens: number;
      status: string;
      feature: string;
    };
    expect(usage.inputTokens).toBe(900);
    expect(usage.status).toBe("OK");
    expect(usage.feature).toBe("SEND_TIME_ADVICE");
    expect(prismaMock.aiSendTimeAdvice.create).not.toHaveBeenCalled();
  });

  it("records a REFUSED ledger row when there is no API key", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const result = await adviseSendTimes({
      clientId: "client-1",
      staffUserId: "staff-1",
      now: NOW,
    });
    expect(result.ok).toBe(false);
    const usage = prismaMock.aiUsageEvent.create.mock.calls[0]?.[0]?.data as {
      status: string;
      outcomeCode: string;
    };
    expect(usage.status).toBe("REFUSED");
    expect(usage.outcomeCode).toBe("no_api_key");
    expect(callAnthropicMock).not.toHaveBeenCalled();
  });

  it("stores the evidence with the advice, so thin advice stays auditable", async () => {
    await adviseSendTimes({ clientId: "client-1", staffUserId: "staff-1", now: NOW });
    const data = prismaMock.aiSendTimeAdvice.create.mock.calls[0]?.[0]?.data as {
      evidence: unknown[];
      totalSent: number;
      totalReplied: number;
      lookbackDays: number;
      promptVersion: string;
      requestedByStaffUserId: string;
    };
    expect(data.evidence.length).toBeGreaterThan(0);
    expect(data.totalSent).toBe(400);
    expect(data.totalReplied).toBe(32);
    expect(data.lookbackDays).toBe(LOOKBACK_DAYS);
    expect(data.promptVersion).toBe(SEND_TIME_ADVICE_PROMPT_VERSION);
    expect(data.requestedByStaffUserId).toBe("staff-1");
  });

  it("does not retry a failed call, because a retry can be a second charge", async () => {
    callAnthropicMock.mockRejectedValue(new Error("timeout"));
    const result = await adviseSendTimes({
      clientId: "client-1",
      staffUserId: "staff-1",
      now: NOW,
    });
    expect(result.ok).toBe(false);
    expect(callAnthropicMock).toHaveBeenCalledTimes(1);
  });

  it("stores an empty window list rather than treating it as a failure", async () => {
    anthropicReturns({
      summary: "No time of day makes a material difference here.",
      windows: [],
      cautions: [],
    });
    const result = await adviseSendTimes({
      clientId: "client-1",
      staffUserId: "staff-1",
      now: NOW,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.windows).toEqual([]);
  });
});

describe("loadLatestSendTimeAdvice", () => {
  it("returns null when a client has never asked", async () => {
    prismaMock.aiSendTimeAdvice.findFirst.mockResolvedValue(null);
    expect(await loadLatestSendTimeAdvice("client-1")).toBeNull();
  });

  it("reads the stored row back into shape", async () => {
    prismaMock.aiSendTimeAdvice.findFirst.mockResolvedValue({
      id: "advice-1",
      summary: "Mornings.",
      windows: [{ weekday: 1, startHour: 9, endHour: 11, reason: "x" }],
      cautions: ["thin"],
      evidence: [
        { weekday: 1, hour: 9, sent: 100, replied: 12, replyRatePercent: 12 },
      ],
      totalSent: 400,
      totalReplied: 32,
      lookbackDays: LOOKBACK_DAYS,
      promptVersion: SEND_TIME_ADVICE_PROMPT_VERSION,
      createdAt: NOW,
    });
    const advice = await loadLatestSendTimeAdvice("client-1");
    expect(advice?.windows).toHaveLength(1);
    expect(advice?.evidence).toHaveLength(1);
    expect(advice?.totalSent).toBe(400);
  });

  it("survives a row whose JSON is not an array", async () => {
    prismaMock.aiSendTimeAdvice.findFirst.mockResolvedValue({
      id: "advice-1",
      summary: "Mornings.",
      windows: null,
      cautions: "broken",
      evidence: undefined,
      totalSent: 400,
      totalReplied: 32,
      lookbackDays: LOOKBACK_DAYS,
      promptVersion: SEND_TIME_ADVICE_PROMPT_VERSION,
      createdAt: NOW,
    });
    const advice = await loadLatestSendTimeAdvice("client-1");
    expect(advice?.windows).toEqual([]);
    expect(advice?.cautions).toEqual([]);
    expect(advice?.evidence).toEqual([]);
  });
});
