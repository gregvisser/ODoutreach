import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, callAiToolMock } = vi.hoisted(() => ({
  prismaMock: {
    clientEmailSequence: { findFirst: vi.fn(), update: vi.fn() },
    clientEmailTemplate: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    aiCampaignReview: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
    aiUsageEvent: { create: vi.fn(), findFirst: vi.fn() },
  },
  callAiToolMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/lib/logger", () => ({
  reportError: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("./ai-tool-messages", () => ({
  callAiToolMessages: callAiToolMock,
  AI_CALL_TIMEOUT_MS: 20_000,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));

import {
  CAMPAIGN_REVIEW_PROMPT_VERSION,
  CAMPAIGN_REVIEW_TOOL,
  MAX_SUGGESTION_CHARS,
} from "@/lib/ai/campaign-review";
import { AI_SEQUENCE_DRAFTING_CALL_TIMEOUT_MS } from "@/lib/ai/sequence-draft-timing";
import { logger } from "@/lib/logger";

import {
  loadLatestCampaignReviews,
  readCampaignReviewAttempt,
  reviewCampaign,
  scheduleCampaignReview,
  stepsToAbsoluteDays,
} from "./review-campaign";

const SEQUENCE = {
  id: "seq-1",
  name: "Q3 manufacturing push",
  client: {
    id: "client-1",
    slug: "acme-safety",
    name: "Acme Safety",
    industry: "Health and safety",
    deletedAt: null,
    briefTaxonomyLinks: [
      { term: { kind: "JOB_TITLE", displayValue: "Operations Director" } },
      { term: { kind: "SERVICE_AREA", displayValue: "Audits" } },
    ],
  },
  steps: [
    {
      position: 0,
      category: "INTRODUCTION",
      delayDays: 0,
      template: { subject: "Quick question", content: "Hello there." },
    },
    {
      position: 1,
      category: "FOLLOW_UP_1",
      delayDays: 3,
      template: { subject: "Following up", content: "Just checking." },
    },
  ],
};

const GOOD_REVIEW = {
  score: 71,
  summary: "Short and specific. The follow-up repeats the introduction.",
  findings: [
    {
      severity: "high",
      area: "sequence_flow",
      finding: "Email 2 makes the same point as email 1.",
      suggestion: "Give it a new angle.",
    },
  ],
};

function modelAnswers(input: unknown, usage = { inputTokens: 1_200, outputTokens: 300 }) {
  callAiToolMock.mockResolvedValue({
    content: [{ type: "tool_use", name: CAMPAIGN_REVIEW_TOOL.name, input }],
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  });
}

function run() {
  return reviewCampaign({
    clientId: "client-1",
    sequenceId: "seq-1",
    staffUserId: "staff-1",
  });
}

beforeEach(() => {
  // Exercise optional behaviour after deliberate activation.
  process.env.AI_OUTREACH_FEATURES = "on";
  prismaMock.clientEmailSequence.findFirst.mockReset().mockResolvedValue(SEQUENCE);
  prismaMock.clientEmailSequence.update.mockReset();
  prismaMock.clientEmailTemplate.create.mockReset();
  prismaMock.clientEmailTemplate.update.mockReset();
  prismaMock.clientEmailTemplate.updateMany.mockReset();
  prismaMock.aiCampaignReview.create.mockReset().mockResolvedValue({ id: "review-1" });
  prismaMock.aiCampaignReview.findMany.mockReset().mockResolvedValue([]);
  prismaMock.aiCampaignReview.findFirst.mockReset().mockResolvedValue(null);
  prismaMock.aiUsageEvent.create.mockReset().mockResolvedValue({ id: "usage-1" });
  prismaMock.aiUsageEvent.findFirst.mockReset().mockResolvedValue(null);
  callAiToolMock.mockReset();
  process.env.XAI_API_KEY = "xai-test";
  delete process.env.XAI_MODEL;
  delete process.env.AI_FEATURES;
});

describe("reviewing a campaign", () => {
  it("stores the score, summary and findings", async () => {
    modelAnswers(GOOD_REVIEW);
    const result = await run();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.score).toBe(71);
    expect(result.findings).toHaveLength(1);

    const row = prismaMock.aiCampaignReview.create.mock.calls[0][0].data;
    expect(row.clientId).toBe("client-1");
    expect(row.sequenceId).toBe("seq-1");
    expect(row.score).toBe(71);
    expect(row.stepCount).toBe(2);
    expect(row.requestedByStaffUserId).toBe("staff-1");
  });

  it("stamps the prompt version, so an old review is not read as a current one", async () => {
    modelAnswers(GOOD_REVIEW);
    await run();
    const row = prismaMock.aiCampaignReview.create.mock.calls[0][0].data;
    expect(row.promptVersion).toBe(CAMPAIGN_REVIEW_PROMPT_VERSION);
    expect(row.model).toContain("grok");
  });

  /**
   * THE ASSERTION THIS WHOLE FEATURE RESTS ON.
   *
   * A campaign review is advice on a screen. If it could edit a template, flip
   * a status, or touch the sequence, then an AI opinion would be changing what
   * gets sent to strangers — and the honest description of the feature would
   * stop being "a critique".
   *
   * Written against the mutating Prisma methods rather than against a comment,
   * so a future cycle that adds "and apply the fix automatically" has to delete
   * an assertion that says why not.
   */
  it("changes nothing about the campaign it reviews", async () => {
    modelAnswers(GOOD_REVIEW);
    await run();

    expect(prismaMock.clientEmailSequence.update).not.toHaveBeenCalled();
    expect(prismaMock.clientEmailTemplate.create).not.toHaveBeenCalled();
    expect(prismaMock.clientEmailTemplate.update).not.toHaveBeenCalled();
    expect(prismaMock.clientEmailTemplate.updateMany).not.toHaveBeenCalled();
  });

  it("scopes the read to the paying client, so one tenant cannot bill for another's copy", async () => {
    modelAnswers(GOOD_REVIEW);
    await run();
    const where = prismaMock.clientEmailSequence.findFirst.mock.calls[0][0].where;
    expect(where.clientId).toBe("client-1");
    expect(where.id).toBe("seq-1");
  });

  it("bills the client even when the answer is unusable, because the tokens were spent", async () => {
    modelAnswers({ score: "not a number", summary: "", findings: [] });
    const result = await run();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("unusable_answer");

    const usage = prismaMock.aiUsageEvent.create.mock.calls[0][0].data;
    expect(usage.status).toBe("OK");
    expect(usage.inputTokens).toBe(1_200);
    expect(usage.costMicroUsd).toBeGreaterThan(0);
    expect(prismaMock.aiCampaignReview.create).not.toHaveBeenCalled();
  });

  it("records the charge against the sequence it was about", async () => {
    modelAnswers(GOOD_REVIEW);
    await run();
    const usage = prismaMock.aiUsageEvent.create.mock.calls[0][0].data;
    expect(usage.feature).toBe("CAMPAIGN_REVIEW");
    expect(usage.subjectType).toBe("ClientEmailSequence");
    expect(usage.subjectId).toBe("seq-1");
  });

  it("refuses without an API key, and records the refusal rather than failing silently", async () => {
    delete process.env.XAI_API_KEY;
    const result = await run();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("no_api_key");
    expect(callAiToolMock).not.toHaveBeenCalled();

    const usage = prismaMock.aiUsageEvent.create.mock.calls[0][0].data;
    expect(usage.status).toBe("REFUSED");
    expect(usage.costMicroUsd).toBe(0);
  });

  it("refuses when AI features are switched off", async () => {
    process.env.AI_FEATURES = "off";
    const result = await run();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("ai_features_switched_off");
    expect(callAiToolMock).not.toHaveBeenCalled();
  });

  it("spends nothing on a sequence with no emails in it", async () => {
    prismaMock.clientEmailSequence.findFirst.mockResolvedValue({
      ...SEQUENCE,
      steps: [],
    });
    const result = await run();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("no_steps");
    expect(callAiToolMock).not.toHaveBeenCalled();
    expect(prismaMock.aiUsageEvent.create).not.toHaveBeenCalled();
  });

  it("refuses a sequence in a deleted workspace", async () => {
    prismaMock.clientEmailSequence.findFirst.mockResolvedValue({
      ...SEQUENCE,
      client: { ...SEQUENCE.client, deletedAt: new Date() },
    });
    const result = await run();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("sequence_not_found");
    expect(callAiToolMock).not.toHaveBeenCalled();
  });

  it("does not retry a failed call, because a retry double-charges", async () => {
    callAiToolMock.mockRejectedValue(new Error("anthropic_http_529: overloaded"));
    const result = await run();

    expect(result.ok).toBe(false);
    expect(callAiToolMock).toHaveBeenCalledTimes(1);
    const usage = prismaMock.aiUsageEvent.create.mock.calls[0][0].data;
    expect(usage.status).toBe("ERROR");
  });

  it("sends the campaign's real copy to the model, fenced", async () => {
    modelAnswers(GOOD_REVIEW);
    await run();
    const sent = callAiToolMock.mock.calls[0][0].userText as string;
    expect(sent).toContain("<campaign>");
    expect(sent).toContain("Quick question");
    expect(sent).toContain("Just checking.");
    expect(sent).toContain("Acme Safety");
  });

  it("truncates a suggestion before it is stored, not just before it is shown", async () => {
    modelAnswers({
      ...GOOD_REVIEW,
      findings: [
        { ...GOOD_REVIEW.findings[0], suggestion: "Rewrite it like this. ".repeat(80) },
      ],
    });
    await run();
    const row = prismaMock.aiCampaignReview.create.mock.calls[0][0].data;
    const findings = row.findings as Array<{ suggestion: string }>;
    expect(findings[0].suggestion.length).toBeLessThanOrEqual(MAX_SUGGESTION_CHARS);
  });
});

describe("stepsToAbsoluteDays", () => {
  it("counts from launch day, not from the previous step", () => {
    // The drafting cadence: delays of 0,3,5,7,9 are days 1,4,9,16,25.
    expect(stepsToAbsoluteDays([0, 3, 5, 7, 9])).toEqual([1, 4, 9, 16, 25]);
  });

  it("handles a single introduction", () => {
    expect(stepsToAbsoluteDays([0])).toEqual([1]);
  });

  it("treats a missing delay as no delay rather than producing NaN", () => {
    expect(stepsToAbsoluteDays([0, Number.NaN, 5])).toEqual([1, 1, 6]);
  });
});

describe("loadLatestCampaignReviews", () => {
  it("keeps only the newest review for each sequence", async () => {
    prismaMock.aiCampaignReview.findMany.mockResolvedValue([
      {
        id: "r2",
        sequenceId: "seq-1",
        score: 80,
        summary: "newer",
        findings: [],
        stepCount: 2,
        promptVersion: "2026-08-29",
        createdAt: new Date("2026-08-29T10:00:00Z"),
      },
      {
        id: "r1",
        sequenceId: "seq-1",
        score: 40,
        summary: "older",
        findings: [],
        stepCount: 2,
        promptVersion: "2026-08-29",
        createdAt: new Date("2026-08-28T10:00:00Z"),
      },
    ]);

    const latest = await loadLatestCampaignReviews("client-1");
    expect(latest.size).toBe(1);
    expect(latest.get("seq-1")?.summary).toBe("newer");
  });

  it("survives a findings column that is not an array", async () => {
    prismaMock.aiCampaignReview.findMany.mockResolvedValue([
      {
        id: "r1",
        sequenceId: "seq-1",
        score: 50,
        summary: "s",
        findings: null,
        stepCount: 1,
        promptVersion: "2026-08-29",
        createdAt: new Date(),
      },
    ]);
    const latest = await loadLatestCampaignReviews("client-1");
    expect(latest.get("seq-1")?.findings).toEqual([]);
  });
});

describe("the grok budget that sequence drafting already uses", () => {
  it("gives grok-4.7 three minutes and low reasoning effort", async () => {
    process.env.XAI_API_KEY = "xai-test-key";
    process.env.XAI_MODEL = "grok-4.7";
    modelAnswers(GOOD_REVIEW);

    await run();

    expect(callAiToolMock.mock.calls[0][0].timeoutMs).toBe(
      AI_SEQUENCE_DRAFTING_CALL_TIMEOUT_MS,
    );
    expect(callAiToolMock.mock.calls[0][0].reasoningEffort).toBe("low");
  });

  it("keeps the long timeout for a non-reasoning model and does not set effort", async () => {
    process.env.XAI_MODEL = "grok-4-fast-non-reasoning";
    modelAnswers(GOOD_REVIEW);
    await run();
    expect(callAiToolMock.mock.calls[0][0].timeoutMs).toBe(
      AI_SEQUENCE_DRAFTING_CALL_TIMEOUT_MS,
    );
    expect(callAiToolMock.mock.calls[0][0].reasoningEffort).toBeUndefined();
  });

  it("logs a provider failure without the API key", async () => {
    callAiToolMock.mockRejectedValue(
      new Error("xai_timeout: exceeded 180000ms Bearer xai-supersecretvalue"),
    );
    const result = await run();
    expect(result.ok).toBe(false);
    const logged = JSON.stringify(vi.mocked(logger.error).mock.calls);
    expect(logged).toContain("xai_timeout");
    expect(logged).not.toContain("supersecret");
  });
});

describe("readCampaignReviewAttempt", () => {
  const since = new Date("2026-09-29T10:00:00Z");

  it("stays pending until a usage row exists", async () => {
    prismaMock.aiUsageEvent.findFirst.mockResolvedValue(null);
    await expect(
      readCampaignReviewAttempt({ clientId: "client-1", sequenceId: "seq-1", since }),
    ).resolves.toEqual({ state: "pending" });
  });

  it("reports a provider failure from the ledger", async () => {
    prismaMock.aiUsageEvent.findFirst.mockResolvedValue({
      status: "ERROR",
      outcomeCode: "xai_timeout: exceeded 180000ms",
    });
    const attempt = await readCampaignReviewAttempt({
      clientId: "client-1",
      sequenceId: "seq-1",
      since,
    });
    expect(attempt.state).toBe("failed");
    if (attempt.state !== "failed") return;
    expect(attempt.message).toContain("temporarily unavailable");
  });

  it("reports the stored score once the review row exists", async () => {
    prismaMock.aiUsageEvent.findFirst.mockResolvedValue({ status: "OK", outcomeCode: null });
    prismaMock.aiCampaignReview.findFirst.mockResolvedValue({
      score: 71,
      findings: [{ title: "one" }],
    });
    const attempt = await readCampaignReviewAttempt({
      clientId: "client-1",
      sequenceId: "seq-1",
      since,
    });
    expect(attempt.state).toBe("succeeded");
    if (attempt.state !== "succeeded") return;
    expect(attempt.message).toContain("71");
    expect(attempt.message).toContain("1 thing");
  });

  it("treats a billed call with no review row as an unusable answer", async () => {
    prismaMock.aiUsageEvent.findFirst.mockResolvedValue({ status: "OK", outcomeCode: null });
    prismaMock.aiCampaignReview.findFirst.mockResolvedValue(null);
    const attempt = await readCampaignReviewAttempt({
      clientId: "client-1",
      sequenceId: "seq-1",
      since,
    });
    expect(attempt.state).toBe("failed");
    if (attempt.state !== "failed") return;
    expect(attempt.message).toContain("usable review");
  });
});

describe("scheduleCampaignReview", () => {
  it("returns before the model call, and redacts a key thrown afterwards", async () => {
    const queued: Array<() => Promise<void>> = [];
    scheduleCampaignReview(
      { clientId: "client-1", sequenceId: "seq-1", staffUserId: "staff-1" },
      (run) => {
        queued.push(run);
      },
    );
    expect(queued).toHaveLength(1);
    expect(callAiToolMock).not.toHaveBeenCalled();

    prismaMock.clientEmailSequence.findFirst.mockRejectedValue(
      new Error("db Bearer xai-supersecretvalue"),
    );
    await queued[0]?.();
    const logged = JSON.stringify(vi.mocked(logger.error).mock.calls);
    expect(logged).toContain("Campaign review failed after the response was sent");
    expect(logged).not.toContain("supersecret");
  });
});
