import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, callAnthropicMock, reportErrorMock } = vi.hoisted(() => ({
  prismaMock: {
    client: { findFirst: vi.fn() },
    aiUsageEvent: { create: vi.fn() },
    trainingAssistantUnansweredQuestion: { create: vi.fn() },
  },
  callAnthropicMock: vi.fn(),
  reportErrorMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/lib/logger", () => ({
  reportError: reportErrorMock,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("./anthropic-messages", () => ({
  callAnthropicMessages: callAnthropicMock,
  AI_CALL_TIMEOUT_MS: 20_000,
}));

import { TRAINING_ASSISTANT_TOOL } from "@/lib/ai/training-assistant-prompt";
import { getTrainingAssistantChunk } from "@/lib/training/assistant-content";
import { searchTrainingContent } from "@/lib/training/assistant-search";

import { answerTrainingQuestion } from "./answer-training-question";

const BIDLOWAI_CLIENT = { id: "client-bidlowai", slug: "bidlowai" };

/** A question this codebase's own training content genuinely answers. */
const IN_SCOPE_QUESTION = "How do I set a branded signature?";
/** The real matched chunk for that question — used so the citation test proves a REAL resolution, not a fixture. */
const REAL_MATCH = searchTrainingContent(IN_SCOPE_QUESTION)[0];
if (!REAL_MATCH) {
  throw new Error(
    "Fixture assumption broken: IN_SCOPE_QUESTION no longer matches any real training content",
  );
}

function modelAnswers(input: unknown, usage = { inputTokens: 500, outputTokens: 60 }) {
  callAnthropicMock.mockResolvedValue({
    content: [{ type: "tool_use", name: TRAINING_ASSISTANT_TOOL.name, input }],
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  });
}

beforeEach(() => {
  prismaMock.client.findFirst.mockReset().mockResolvedValue(BIDLOWAI_CLIENT);
  prismaMock.aiUsageEvent.create.mockReset().mockResolvedValue({ id: "usage-1" });
  prismaMock.trainingAssistantUnansweredQuestion.create
    .mockReset()
    .mockResolvedValue({ id: "unanswered-1" });
  callAnthropicMock.mockReset();
  reportErrorMock.mockReset();
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  delete process.env.AI_FEATURES;
});

describe("out-of-scope questions never reach the model", () => {
  it("returns the do-not-know path and logs NO_MATCHING_CONTENT — no model call, nothing billed", async () => {
    const out = await answerTrainingQuestion({
      question: "What is the boiling point of tungsten on Mars at sea level pressure?",
      askedByEmail: "staff@opensdoors.co.uk",
    });

    expect(out).toEqual({ ok: true, canAnswer: false, unansweredQuestionId: "unanswered-1" });
    expect(callAnthropicMock).not.toHaveBeenCalled();
    // Never even resolves the billing client — nothing was going to be charged.
    expect(prismaMock.client.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.aiUsageEvent.create).not.toHaveBeenCalled();

    expect(prismaMock.trainingAssistantUnansweredQuestion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reason: "NO_MATCHING_CONTENT",
          askedByEmail: "staff@opensdoors.co.uk",
        }),
      }),
    );
  });
});

describe("a real answer carries a citation that resolves to real training content", () => {
  it("returns citations whose href and label match a real chunk actually retrieved for this question", async () => {
    modelAnswers({
      canAnswer: true,
      answer: "Use the Set signature button, or Set branded signatures for every mailbox at once.",
      citedChunkIds: [REAL_MATCH.chunk.id],
    });

    const out = await answerTrainingQuestion({
      question: IN_SCOPE_QUESTION,
      askedByEmail: "staff@opensdoors.co.uk",
    });

    expect(out.ok).toBe(true);
    if (!out.ok || !out.canAnswer) throw new Error("expected a real answer");

    expect(out.citations.length).toBeGreaterThan(0);
    const [citation] = out.citations;
    const realChunk = getTrainingAssistantChunk(REAL_MATCH.chunk.id);
    expect(realChunk).toBeDefined();
    expect(citation.href).toBe(realChunk?.href);
    expect(citation.label).toBe(realChunk?.label);
    expect(citation.href.startsWith("/training/")).toBe(true);

    // Billed to bidlowai, not to whatever client the staff member was looking at.
    expect(prismaMock.aiUsageEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ clientId: "client-bidlowai", feature: "TRAINING_ASSISTANT" }),
      }),
    );
  });

  it("discards a citation the model invented — an id that was never actually retrieved for this question", async () => {
    modelAnswers({
      canAnswer: true,
      answer: "An answer citing content it was never shown.",
      citedChunkIds: ["module:not-a-real-module:purpose"],
    });

    const out = await answerTrainingQuestion({
      question: IN_SCOPE_QUESTION,
      askedByEmail: "staff@opensdoors.co.uk",
    });

    // A canAnswer:true with no valid citation is treated as unsure, not trusted.
    expect(out).toEqual({ ok: true, canAnswer: false, unansweredQuestionId: "unanswered-1" });
    expect(prismaMock.trainingAssistantUnansweredQuestion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reason: "MODEL_UNSURE" }) }),
    );
  });
});

describe("the model saying it does not know is a designed, honest outcome", () => {
  it("logs MODEL_UNSURE and returns do-not-know when the model sets canAnswer to false", async () => {
    modelAnswers({
      canAnswer: false,
      answer: "The training material does not cover this.",
      citedChunkIds: [],
    });

    const out = await answerTrainingQuestion({
      question: IN_SCOPE_QUESTION,
      askedByEmail: "staff@opensdoors.co.uk",
    });

    expect(out).toEqual({ ok: true, canAnswer: false, unansweredQuestionId: "unanswered-1" });
    expect(prismaMock.trainingAssistantUnansweredQuestion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reason: "MODEL_UNSURE" }) }),
    );
  });
});

describe("the personal-data processor gate (CR-10)", () => {
  it("refuses to answer — and never calls Anthropic — if TRAINING_ASSISTANT were ever declared to carry personal data", async () => {
    vi.resetModules();
    vi.doMock("./ai-feature-data-policy", async (importOriginal) => {
      const actual =
        await importOriginal<typeof import("./ai-feature-data-policy")>();
      return {
        ...actual,
        isPersonalDataUncovered: (feature: string) =>
          feature === "TRAINING_ASSISTANT" ? true : actual.isPersonalDataUncovered(feature as never),
      };
    });

    const { answerTrainingQuestion: answerWithHypotheticalPolicy } = await import(
      "./answer-training-question"
    );

    modelAnswers({ canAnswer: true, answer: "should never be reached", citedChunkIds: [] });

    const out = await answerWithHypotheticalPolicy({
      question: IN_SCOPE_QUESTION,
      askedByEmail: "staff@opensdoors.co.uk",
    });

    expect(out).toEqual({ ok: true, canAnswer: false, unansweredQuestionId: "unanswered-1" });
    expect(callAnthropicMock).not.toHaveBeenCalled();
    expect(prismaMock.aiUsageEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "REFUSED", outcomeCode: "no_processor_allowance" }),
      }),
    );
    expect(prismaMock.trainingAssistantUnansweredQuestion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reason: "AI_CALL_REFUSED" }) }),
    );

    vi.doUnmock("./ai-feature-data-policy");
    vi.resetModules();
  });
});
