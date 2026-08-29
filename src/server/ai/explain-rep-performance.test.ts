import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, callAnthropicMock } = vi.hoisted(() => ({
  prismaMock: {
    client: { findFirst: vi.fn() },
    outboundEmail: { findMany: vi.fn() },
    clientMailboxIdentity: { findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    aiRepPerformanceReview: { create: vi.fn(), findFirst: vi.fn() },
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
  REP_PERFORMANCE_PROMPT_VERSION,
  REP_PERFORMANCE_TOOL,
} from "@/lib/ai/rep-performance";
import { REP_LOOKBACK_DAYS } from "@/lib/ai/rep-performance-evidence";

import {
  explainRepPerformance,
  loadLatestRepPerformanceReview,
} from "./explain-rep-performance";

const CLIENT = {
  id: "client-1",
  slug: "acme-safety",
  name: "Acme Safety",
  industry: "Health and safety",
};

const NOW = new Date("2026-08-29T10:00:00Z");

const ALEX = "Alex Poole — alex@acme.co.uk";
const BEV = "Bev Nair — bev@acme.co.uk";

const IDENTITY_ROWS = [
  {
    id: "mbx-a",
    email: "alex@acme.co.uk",
    displayName: null,
    senderDisplayName: "Alex Poole",
  },
  {
    id: "mbx-b",
    email: "bev@acme.co.uk",
    displayName: "Bev Nair",
    senderDisplayName: null,
  },
];

type OutboundRow = {
  mailboxIdentityId: string | null;
  bouncedAt: Date | null;
  inboundReplies: { classification: string | null }[];
};

/**
 * Two mailboxes whose reply rates differ far too much to be chance: 12% against
 * 2% on 500 sends each.
 */
function historyWithARealGap(): OutboundRow[] {
  const rows: OutboundRow[] = [];
  const spec = [
    { id: "mbx-a", sent: 500, replied: 60, positive: 20, bounced: 5 },
    { id: "mbx-b", sent: 500, replied: 10, positive: 1, bounced: 90 },
  ];
  for (const rep of spec) {
    for (let i = 0; i < rep.sent; i += 1) {
      rows.push({
        mailboxIdentityId: rep.id,
        bouncedAt: i >= rep.sent - rep.bounced ? new Date("2026-08-01T00:00:00Z") : null,
        inboundReplies:
          i < rep.replied
            ? [{ classification: i < rep.positive ? "POSITIVE" : "NOT_INTERESTED" }]
            : [],
      });
    }
  }
  return rows;
}

/** Two mailboxes a few replies apart — inside the noise. */
function historyWithNoRealGap(): OutboundRow[] {
  const rows: OutboundRow[] = [];
  for (const rep of [
    { id: "mbx-a", sent: 500, replied: 30 },
    { id: "mbx-b", sent: 500, replied: 25 },
  ]) {
    for (let i = 0; i < rep.sent; i += 1) {
      rows.push({
        mailboxIdentityId: rep.id,
        bouncedAt: null,
        inboundReplies: i < rep.replied ? [{ classification: "NOT_INTERESTED" }] : [],
      });
    }
  }
  return rows;
}

const GOOD_ANSWER = {
  summary: "One mailbox is clearly behind, and it is bouncing heavily.",
  findings: [
    {
      senderLabel: BEV,
      observation: "2% reply rate against 12% for the other mailbox, on 500 sends.",
      likelyCauses: [
        "The sending domain may be failing DMARC.",
        "The mailbox may still be inside its warm-up.",
      ],
      checkFirst: "Check SPF, DKIM and DMARC for that mailbox's domain.",
    },
  ],
  cautions: ["Only replies the matcher could link to a send are counted."],
};

function anthropicReturns(input: unknown): void {
  callAnthropicMock.mockResolvedValue({
    content: [{ type: "tool_use", name: REP_PERFORMANCE_TOOL.name, input }],
    inputTokens: 1_200,
    outputTokens: 320,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.client.findFirst.mockResolvedValue(CLIENT);
  prismaMock.outboundEmail.findMany.mockResolvedValue(historyWithARealGap());
  prismaMock.clientMailboxIdentity.findMany.mockResolvedValue(IDENTITY_ROWS);
  prismaMock.aiRepPerformanceReview.create.mockResolvedValue({ id: "review-1" });
  prismaMock.aiUsageEvent.create.mockResolvedValue({ id: "usage-1" });
  anthropicReturns(GOOD_ANSWER);
  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.AI_FEATURES_ENABLED = "true";
});

describe("explainRepPerformance", () => {
  it("explains a real gap, and stores the table it was drawn from", async () => {
    const result = await explainRepPerformance({
      clientId: "client-1",
      staffUserId: "staff-1",
      now: NOW,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.findings).toHaveLength(1);
    expect(result.anyDistinguishable).toBe(true);

    const written = prismaMock.aiRepPerformanceReview.create.mock.calls[0][0]
      .data as {
      evidence: { label: string; sent: number; replyRatePercent: number }[];
      totalSent: number;
      totalPositive: number;
      anyDistinguishable: boolean;
      promptVersion: string;
      lookbackDays: number;
    };
    expect(written.totalSent).toBe(1_000);
    expect(written.totalPositive).toBe(21);
    expect(written.anyDistinguishable).toBe(true);
    expect(written.promptVersion).toBe(REP_PERFORMANCE_PROMPT_VERSION);
    expect(written.lookbackDays).toBe(REP_LOOKBACK_DAYS);
    expect(written.evidence.map((r) => r.label)).toEqual([ALEX, BEV]);
  });

  it("bills the client for the call, naming this feature", async () => {
    await explainRepPerformance({
      clientId: "client-1",
      staffUserId: "staff-1",
      now: NOW,
    });

    const usage = prismaMock.aiUsageEvent.create.mock.calls[0][0].data as {
      clientId: string;
      feature: string;
      status: string;
      inputTokens: number;
      outputTokens: number;
      costMicroUsd: number;
    };
    expect(usage.clientId).toBe("client-1");
    expect(usage.feature).toBe("REP_PERFORMANCE");
    expect(usage.status).toBe("OK");
    expect(usage.inputTokens).toBe(1_200);
    expect(usage.outputTokens).toBe(320);
    expect(usage.costMicroUsd).toBeGreaterThan(0);
  });

  it("DROPS a finding about a sender whose result is within normal variation", async () => {
    // The control that survives the model ignoring the prompt. Bev's numbers
    // here are a handful of replies from Alex's; our own arithmetic says that is
    // not a difference, so a paragraph explaining it must not reach the screen.
    prismaMock.outboundEmail.findMany.mockResolvedValue(historyWithNoRealGap());
    anthropicReturns({
      summary: "Bev is trailing Alex.",
      findings: [
        {
          senderLabel: BEV,
          observation: "5% against 6%.",
          likelyCauses: ["Possibly a weaker domain reputation.", "Possibly the list."],
          checkFirst: "Check the domain.",
        },
      ],
      cautions: [],
    });

    const result = await explainRepPerformance({
      clientId: "client-1",
      staffUserId: "staff-1",
      now: NOW,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.anyDistinguishable).toBe(false);
    expect(result.findings).toHaveLength(0);

    // And the dropped finding is not quietly stored either.
    const written = prismaMock.aiRepPerformanceReview.create.mock.calls[0][0]
      .data as { findings: unknown[] };
    expect(written.findings).toHaveLength(0);
  });

  it("drops a finding naming a sender that is not in the table at all", async () => {
    anthropicReturns({
      summary: "Someone is behind.",
      findings: [
        {
          senderLabel: "Chris — chris@acme.co.uk",
          observation: "Very low reply rate.",
          likelyCauses: ["Domain reputation.", "Warm-up."],
          checkFirst: "Check the domain.",
        },
      ],
      cautions: [],
    });

    const result = await explainRepPerformance({
      clientId: "client-1",
      staffUserId: "staff-1",
      now: NOW,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.findings).toHaveLength(0);
  });

  it("spends NOTHING when the senders cannot be told apart for lack of sending", async () => {
    prismaMock.outboundEmail.findMany.mockResolvedValue([
      { mailboxIdentityId: "mbx-a", bouncedAt: null, inboundReplies: [] },
    ]);

    const result = await explainRepPerformance({
      clientId: "client-1",
      staffUserId: "staff-1",
      now: NOW,
    });

    expect(result.ok).toBe(false);
    // No call, no ledger row for a call that did not happen, and nothing
    // written about anybody.
    expect(callAnthropicMock).not.toHaveBeenCalled();
    expect(prismaMock.aiUsageEvent.create).not.toHaveBeenCalled();
    expect(prismaMock.aiRepPerformanceReview.create).not.toHaveBeenCalled();
  });

  it("refuses, and records the refusal, when there is no API key", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const result = await explainRepPerformance({
      clientId: "client-1",
      staffUserId: "staff-1",
      now: NOW,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("no_api_key");
    expect(callAnthropicMock).not.toHaveBeenCalled();
    // "Off on purpose" must be visibly different from "silently stopped
    // working" — the ledger is where that distinction lives.
    const usage = prismaMock.aiUsageEvent.create.mock.calls[0][0].data as {
      status: string;
      feature: string;
    };
    expect(usage.status).toBe("REFUSED");
    expect(usage.feature).toBe("REP_PERFORMANCE");
    expect(prismaMock.aiRepPerformanceReview.create).not.toHaveBeenCalled();
  });

  it("writes nothing when the model returns an unusable answer", async () => {
    callAnthropicMock.mockResolvedValue({
      content: [{ type: "text", text: "I can't help with that." }],
      inputTokens: 800,
      outputTokens: 10,
    });

    const result = await explainRepPerformance({
      clientId: "client-1",
      staffUserId: "staff-1",
      now: NOW,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("unusable_answer");
    expect(prismaMock.aiRepPerformanceReview.create).not.toHaveBeenCalled();
    // Still billed: the tokens were spent whatever the model decided.
    const usage = prismaMock.aiUsageEvent.create.mock.calls[0][0].data as {
      status: string;
      inputTokens: number;
    };
    expect(usage.status).toBe("OK");
    expect(usage.inputTokens).toBe(800);
  });

  it("refuses a soft-deleted workspace", async () => {
    prismaMock.client.findFirst.mockResolvedValue(null);

    const result = await explainRepPerformance({
      clientId: "client-1",
      staffUserId: "staff-1",
      now: NOW,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("client_not_found");
    expect(callAnthropicMock).not.toHaveBeenCalled();
  });

  it("changes nothing about any mailbox", async () => {
    // The whole feature is prose about a table. If it ever grew a route to a
    // mailbox row — a cap, a sending toggle, a primary flag — this goes red.
    await explainRepPerformance({
      clientId: "client-1",
      staffUserId: "staff-1",
      now: NOW,
    });

    expect(prismaMock.clientMailboxIdentity.update).not.toHaveBeenCalled();
    expect(prismaMock.clientMailboxIdentity.updateMany).not.toHaveBeenCalled();
  });

  it("reads only sends inside the lookback window that have a mailbox", async () => {
    await explainRepPerformance({
      clientId: "client-1",
      staffUserId: "staff-1",
      now: NOW,
    });

    const where = prismaMock.outboundEmail.findMany.mock.calls[0][0].where as {
      clientId: string;
      sentAt: { gte: Date };
      mailboxIdentityId: { not: null };
    };
    expect(where.clientId).toBe("client-1");
    expect(where.mailboxIdentityId).toEqual({ not: null });
    const expected = new Date(
      NOW.getTime() - REP_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
    );
    expect(where.sentAt.gte.toISOString()).toBe(expected.toISOString());
  });
});

describe("loadLatestRepPerformanceReview", () => {
  it("reads a stored review back, so a paid-for answer survives a refresh", async () => {
    prismaMock.aiRepPerformanceReview.findFirst.mockResolvedValue({
      id: "review-1",
      summary: "One mailbox is behind.",
      findings: GOOD_ANSWER.findings,
      cautions: GOOD_ANSWER.cautions,
      evidence: [{ label: ALEX, sent: 500 }],
      totalSent: 1_000,
      totalReplied: 70,
      totalPositive: 21,
      lookbackDays: REP_LOOKBACK_DAYS,
      anyDistinguishable: true,
      promptVersion: REP_PERFORMANCE_PROMPT_VERSION,
      createdAt: NOW,
    });

    const stored = await loadLatestRepPerformanceReview("client-1");
    expect(stored?.findings).toHaveLength(1);
    expect(stored?.anyDistinguishable).toBe(true);
    expect(stored?.totalPositive).toBe(21);
  });

  it("returns null when this client has never been compared", async () => {
    prismaMock.aiRepPerformanceReview.findFirst.mockResolvedValue(null);
    expect(await loadLatestRepPerformanceReview("client-1")).toBeNull();
  });

  it("survives a row whose JSON columns are not arrays", async () => {
    prismaMock.aiRepPerformanceReview.findFirst.mockResolvedValue({
      id: "review-1",
      summary: "x",
      findings: null,
      cautions: "nope",
      evidence: undefined,
      totalSent: 1_000,
      totalReplied: 70,
      totalPositive: 21,
      lookbackDays: REP_LOOKBACK_DAYS,
      anyDistinguishable: false,
      promptVersion: REP_PERFORMANCE_PROMPT_VERSION,
      createdAt: NOW,
    });

    const stored = await loadLatestRepPerformanceReview("client-1");
    expect(stored?.findings).toEqual([]);
    expect(stored?.cautions).toEqual([]);
    expect(stored?.evidence).toEqual([]);
  });
});
