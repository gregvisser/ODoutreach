import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, callAnthropicMock } = vi.hoisted(() => ({
  prismaMock: {
    client: { findFirst: vi.fn() },
    clientEmailSequenceEnrollment: { findMany: vi.fn() },
    clientEmailSequence: { findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    clientEmailTemplate: { update: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    contact: { update: vi.fn(), updateMany: vi.fn() },
    outboundEmail: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    aiTitleMessageReview: { create: vi.fn(), findFirst: vi.fn() },
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
  TITLE_MESSAGE_PROMPT_VERSION,
  TITLE_MESSAGE_TOOL,
} from "@/lib/ai/title-message";
import {
  TITLE_MESSAGE_LOOKBACK_DAYS,
  TITLE_MESSAGE_MATURITY_DAYS,
} from "@/lib/ai/title-message-evidence";

import {
  adviseTitleMessages,
  loadLatestTitleMessageReview,
} from "./advise-title-messages";

const CLIENT = {
  id: "client-1",
  slug: "acme-safety",
  name: "Acme Safety",
  industry: "Health and safety",
};

const NOW = new Date("2026-08-29T10:00:00Z");

const SEQUENCE_ROWS = [
  { id: "seq-a", name: "Cost-saving campaign" },
  { id: "seq-b", name: "Compliance campaign" },
];

type EnrollmentRow = {
  sequenceId: string;
  contact: { title: string | null };
  stepSends: {
    outboundEmail: {
      sentAt: Date | null;
      inboundReplies: { classification: string | null }[];
    } | null;
  }[];
};

const SENT_AT = new Date("2026-06-01T00:00:00Z");

function enrollments(spec: {
  sequenceId: string;
  title: string | null;
  count: number;
  replied: number;
  /** Enrolled but never actually emailed — suppressed, excluded, still pending. */
  neverSent?: boolean;
}): EnrollmentRow[] {
  const rows: EnrollmentRow[] = [];
  for (let i = 0; i < spec.count; i += 1) {
    const didReply = i < spec.replied;
    rows.push({
      sequenceId: spec.sequenceId,
      contact: { title: spec.title },
      stepSends: [
        {
          outboundEmail: {
            sentAt: spec.neverSent ? null : SENT_AT,
            inboundReplies: didReply
              ? [{ classification: i % 3 === 0 ? "POSITIVE" : "NOT_INTERESTED" }]
              : [],
          },
        },
      ],
    });
  }
  return rows;
}

/** Two campaigns to one audience, 20% against 3% on 800 people each. */
function historyWithARealGap(): EnrollmentRow[] {
  return [
    ...enrollments({
      sequenceId: "seq-a",
      title: "Operations Manager",
      count: 800,
      replied: 160,
    }),
    ...enrollments({
      sequenceId: "seq-b",
      title: "Operations Manager",
      count: 800,
      replied: 24,
    }),
  ];
}

/** Two campaigns a few replies apart — inside the noise. */
function historyWithNoRealGap(): EnrollmentRow[] {
  return [
    ...enrollments({
      sequenceId: "seq-a",
      title: "Operations Manager",
      count: 500,
      replied: 30,
    }),
    ...enrollments({
      sequenceId: "seq-b",
      title: "Operations Manager",
      count: 500,
      replied: 26,
    }),
  ];
}

function toolResponse(input: unknown) {
  return {
    content: [{ type: "tool_use", name: TITLE_MESSAGE_TOOL.name, input }],
    inputTokens: 1_400,
    outputTokens: 300,
  };
}

const GOOD_ANSWER = {
  summary: "The cost-saving campaign got more replies from operations people.",
  findings: [
    {
      audienceLabel: "Operations",
      messageLabel: "Cost-saving campaign",
      observation: "20% of the 800 operations contacts replied, against 3%.",
      couldExplainIt: ["The two lists were built differently."],
      checkFirst: "How each campaign's contact list was sourced.",
    },
  ],
  cautions: ["Nobody was randomised between the two campaigns."],
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = "sk-test-key";
  prismaMock.client.findFirst.mockResolvedValue(CLIENT);
  prismaMock.clientEmailSequence.findMany.mockResolvedValue(SEQUENCE_ROWS);
  prismaMock.aiTitleMessageReview.create.mockResolvedValue({ id: "review-1" });
  prismaMock.aiUsageEvent.create.mockResolvedValue({ id: "usage-1" });
});

describe("adviseTitleMessages — the gate, which runs before any money is spent", () => {
  it("refuses an unknown workspace without calling the model", async () => {
    prismaMock.client.findFirst.mockResolvedValue(null);

    const result = await adviseTitleMessages({
      clientId: "nope",
      staffUserId: "staff-1",
      now: NOW,
    });

    expect(result).toEqual({ ok: false, reason: "client_not_found" });
    expect(callAnthropicMock).not.toHaveBeenCalled();
    expect(prismaMock.aiUsageEvent.create).not.toHaveBeenCalled();
  });

  /**
   * THE COST GATE. A client whose campaigns cannot be told apart must cost
   * nothing at all — no API call, and no ledger row for a call that never
   * happened.
   */
  it("refuses a client with too little history, spending nothing", async () => {
    prismaMock.clientEmailSequenceEnrollment.findMany.mockResolvedValue(
      enrollments({
        sequenceId: "seq-a",
        title: "Operations Manager",
        count: 40,
        replied: 4,
      }),
    );

    const result = await adviseTitleMessages({
      clientId: CLIENT.id,
      staffUserId: "staff-1",
      now: NOW,
    });

    expect(result.ok).toBe(false);
    expect(callAnthropicMock).not.toHaveBeenCalled();
    expect(prismaMock.aiUsageEvent.create).not.toHaveBeenCalled();
    expect(prismaMock.aiTitleMessageReview.create).not.toHaveBeenCalled();
  });

  it("reads only matured enrollments, and only from the lookback window", async () => {
    prismaMock.clientEmailSequenceEnrollment.findMany.mockResolvedValue(
      historyWithARealGap(),
    );
    callAnthropicMock.mockResolvedValue(toolResponse(GOOD_ANSWER));

    await adviseTitleMessages({
      clientId: CLIENT.id,
      staffUserId: "staff-1",
      now: NOW,
    });

    const where = prismaMock.clientEmailSequenceEnrollment.findMany.mock.calls[0][0]
      .where as { enrolledAt: { gte: Date; lte: Date } };
    const day = 24 * 60 * 60 * 1000;
    expect(where.enrolledAt.gte).toEqual(
      new Date(NOW.getTime() - TITLE_MESSAGE_LOOKBACK_DAYS * day),
    );
    // The maturity window: the most recent five weeks are deliberately absent,
    // because those people are still being emailed.
    expect(where.enrolledAt.lte).toEqual(
      new Date(NOW.getTime() - TITLE_MESSAGE_MATURITY_DAYS * day),
    );
  });

  /**
   * Somebody enrolled but never emailed — suppressed, excluded, still pending —
   * was never given the chance to reply. Counting them as a non-replier would
   * punish whichever campaign was pointed at the dirtier list.
   */
  it("does not count an enrollment that never produced a sent email", async () => {
    prismaMock.clientEmailSequenceEnrollment.findMany.mockResolvedValue([
      ...historyWithNoRealGap(),
      ...enrollments({
        sequenceId: "seq-b",
        title: "Operations Manager",
        count: 5_000,
        replied: 0,
        neverSent: true,
      }),
    ]);
    callAnthropicMock.mockResolvedValue(
      toolResponse({ ...GOOD_ANSWER, findings: [] }),
    );

    const result = await adviseTitleMessages({
      clientId: CLIENT.id,
      staffUserId: "staff-1",
      now: NOW,
    });

    expect(result.ok).toBe(true);
    // Five thousand never-emailed people would have crushed seq-b's rate and
    // manufactured a difference. The stored totals must not know about them.
    const stored = prismaMock.aiTitleMessageReview.create.mock.calls[0][0].data as {
      coverage: { totalEnrollments: number; compared: number };
      anyDistinguishable: boolean;
    };
    expect(stored.coverage.totalEnrollments).toBe(1_000);
    expect(stored.coverage.compared).toBe(1_000);
    expect(stored.anyDistinguishable).toBe(false);
  });
});

describe("adviseTitleMessages — the answer", () => {
  it("records the analysis, the table it came from, and the moving threshold", async () => {
    prismaMock.clientEmailSequenceEnrollment.findMany.mockResolvedValue(
      historyWithARealGap(),
    );
    callAnthropicMock.mockResolvedValue(toolResponse(GOOD_ANSWER));

    const result = await adviseTitleMessages({
      clientId: CLIENT.id,
      staffUserId: "staff-1",
      now: NOW,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reviewId).toBe("review-1");
    expect(result.anyDistinguishable).toBe(true);
    expect(result.findings).toHaveLength(1);
    expect(result.costMicroUsd).toBeGreaterThan(0);

    const data = prismaMock.aiTitleMessageReview.create.mock.calls[0][0].data as {
      clientId: string;
      promptVersion: string;
      comparisonCount: number;
      zThresholdMilli: number;
      lookbackDays: number;
      requestedByStaffUserId: string;
    };
    expect(data.clientId).toBe(CLIENT.id);
    expect(data.promptVersion).toBe(TITLE_MESSAGE_PROMPT_VERSION);
    expect(data.lookbackDays).toBe(TITLE_MESSAGE_LOOKBACK_DAYS);
    expect(data.comparisonCount).toBe(2);
    expect(data.requestedByStaffUserId).toBe("staff-1");
    // The threshold is stored as integer milli-standard-errors, never a float.
    expect(Number.isInteger(data.zThresholdMilli)).toBe(true);
    expect(data.zThresholdMilli).toBeGreaterThanOrEqual(2_000);
  });

  it("bills the call even when the model returns something unusable", async () => {
    prismaMock.clientEmailSequenceEnrollment.findMany.mockResolvedValue(
      historyWithARealGap(),
    );
    callAnthropicMock.mockResolvedValue({
      content: [{ type: "text", text: "sorry" }],
      inputTokens: 1_400,
      outputTokens: 20,
    });

    const result = await adviseTitleMessages({
      clientId: CLIENT.id,
      staffUserId: "staff-1",
      now: NOW,
    });

    expect(result).toEqual({ ok: false, reason: "unusable_answer" });
    // The tokens were spent, so the ledger records them. Nothing is stored as
    // an answer.
    expect(prismaMock.aiUsageEvent.create).toHaveBeenCalled();
    expect(prismaMock.aiTitleMessageReview.create).not.toHaveBeenCalled();
  });

  /**
   * THE STRUCTURAL GUARDRAIL. The model is told to explain only the gaps our
   * arithmetic called real. If it does it anyway, the finding must be dropped
   * here — a prompt is advice, this is a control.
   */
  it("drops a finding about a pair the arithmetic called normal variation", async () => {
    prismaMock.clientEmailSequenceEnrollment.findMany.mockResolvedValue(
      historyWithNoRealGap(),
    );
    callAnthropicMock.mockResolvedValue(
      toolResponse({
        summary: "No campaign is clearly ahead.",
        findings: [
          {
            audienceLabel: "Operations",
            messageLabel: "Cost-saving campaign",
            observation: "It edged ahead at 6% against 5%.",
            couldExplainIt: ["Different lists."],
            checkFirst: "The lists.",
          },
        ],
        cautions: [],
      }),
    );

    const result = await adviseTitleMessages({
      clientId: CLIENT.id,
      staffUserId: "staff-1",
      now: NOW,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.anyDistinguishable).toBe(false);
    expect(result.findings).toHaveLength(0);

    const data = prismaMock.aiTitleMessageReview.create.mock.calls[0][0].data as {
      findings: unknown[];
    };
    expect(data.findings).toHaveLength(0);
  });

  it("drops a finding naming a pair that is not in the table at all", async () => {
    prismaMock.clientEmailSequenceEnrollment.findMany.mockResolvedValue(
      historyWithARealGap(),
    );
    callAnthropicMock.mockResolvedValue(
      toolResponse({
        ...GOOD_ANSWER,
        findings: [
          ...GOOD_ANSWER.findings,
          {
            audienceLabel: "Chief Astrologers",
            messageLabel: "Cost-saving campaign",
            observation: "They loved it.",
            couldExplainIt: ["Made up."],
            checkFirst: "Nothing.",
          },
        ],
      }),
    );

    const result = await adviseTitleMessages({
      clientId: CLIENT.id,
      staffUserId: "staff-1",
      now: NOW,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.findings.map((f) => f.audienceLabel)).toEqual(["Operations"]);
  });

  /**
   * THE ADVISORY PROPERTY, asserted rather than asserted-in-prose. This feature
   * reads history and writes one review row. If it ever gained a route to a
   * template, a campaign, a contact or the outbound queue, that would be a
   * change to what a client's prospects receive, and it would be invisible in
   * every other test in this file.
   */
  it("changes no campaign, template, contact or outbound mail", async () => {
    prismaMock.clientEmailSequenceEnrollment.findMany.mockResolvedValue(
      historyWithARealGap(),
    );
    callAnthropicMock.mockResolvedValue(toolResponse(GOOD_ANSWER));

    await adviseTitleMessages({
      clientId: CLIENT.id,
      staffUserId: "staff-1",
      now: NOW,
    });

    expect(prismaMock.clientEmailSequence.update).not.toHaveBeenCalled();
    expect(prismaMock.clientEmailSequence.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.clientEmailTemplate.create).not.toHaveBeenCalled();
    expect(prismaMock.clientEmailTemplate.update).not.toHaveBeenCalled();
    expect(prismaMock.clientEmailTemplate.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.contact.update).not.toHaveBeenCalled();
    expect(prismaMock.contact.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.outboundEmail.create).not.toHaveBeenCalled();
    expect(prismaMock.outboundEmail.update).not.toHaveBeenCalled();
    expect(prismaMock.outboundEmail.updateMany).not.toHaveBeenCalled();
  });
});

describe("loadLatestTitleMessageReview", () => {
  it("returns null when nothing has been analysed yet", async () => {
    prismaMock.aiTitleMessageReview.findFirst.mockResolvedValue(null);
    await expect(loadLatestTitleMessageReview("client-1")).resolves.toBeNull();
  });

  it("reads a stored analysis back, tolerating malformed JSON columns", async () => {
    prismaMock.aiTitleMessageReview.findFirst.mockResolvedValue({
      id: "review-1",
      summary: "A summary.",
      findings: "not an array",
      cautions: null,
      evidence: undefined,
      coverage: [1, 2, 3],
      totalReplied: 40,
      totalPositive: 12,
      lookbackDays: 180,
      comparisonCount: 4,
      zThresholdMilli: 2_498,
      anyDistinguishable: false,
      promptVersion: TITLE_MESSAGE_PROMPT_VERSION,
      createdAt: NOW,
    });

    const review = await loadLatestTitleMessageReview("client-1");
    expect(review).not.toBeNull();
    // A column that is not the shape we wrote is read as empty rather than
    // crashing a page that is only showing advice.
    expect(review?.findings).toEqual([]);
    expect(review?.cautions).toEqual([]);
    expect(review?.evidence).toEqual([]);
    expect(review?.coverage).toBeNull();
    expect(review?.zThresholdMilli).toBe(2_498);
  });
});
