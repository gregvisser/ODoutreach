import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireOpensDoorsStaff, callAiMock, prismaMock } = vi.hoisted(() => ({
  requireOpensDoorsStaff: vi.fn(),
  callAiMock: vi.fn(),
  prismaMock: {
    client: { findFirst: vi.fn() },
    aiUsageEvent: { create: vi.fn() },
    trainingAssistantUnansweredQuestion: { create: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/server/auth/staff", () => ({ requireOpensDoorsStaff }));
vi.mock("@/app/(app)/support/actions", () => ({ createSupportTicket: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/lib/logger", () => ({
  reportError: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/server/ai/ai-tool-messages", () => ({
  callAiToolMessages: callAiMock,
}));

import { askTrainingAssistantAction } from "./assistant-actions";

/**
 * The header "How do I...?" button calls `askTrainingAssistantAction`.
 * These questions must be answered by that function, not by a search helper
 * the header never calls. xAI is mocked to refuse; a title-matched guide
 * section must still come back.
 */
describe("header How do I bar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireOpensDoorsStaff.mockResolvedValue({ id: "staff-1", email: "staff@opensdoors.co.uk" });
    callAiMock.mockResolvedValue({
      content: [{
        type: "tool_use",
        name: "record_training_assistant_answer",
        input: { canAnswer: false, answer: "The training material does not cover this.", citedChunkIds: [] },
      }],
      inputTokens: 10,
      outputTokens: 10,
    });
    prismaMock.trainingAssistantUnansweredQuestion.create.mockResolvedValue({ id: "unanswered-1" });
  });

  it.each([
    ["How do I connect a new mailbox?", /Add mailbox/i],
    ["How do I reconnect a mailbox?", /Reconnect is the same sign-in/i],
    ["How do I import contacts from RocketReach?", /SEARCH ROCKETREACH/],
    ["How do I add a follow-up step?", /Add follow-up/i],
    ["How do I resolve a support ticket?", /Resolve & close/],
    ["What does Queued mean?", /Queued is not Sent/],
  ])("answers %s from the training guide", async (question, pattern) => {
    const out = await askTrainingAssistantAction(question);

    expect(out.ok).toBe(true);
    if (!out.ok || !("canAnswer" in out) || out.canAnswer !== true) {
      throw new Error(`expected a grounded answer for ${question}`);
    }
    expect(out.answer).toMatch(pattern);
    expect(out.citations.length).toBeGreaterThan(0);
    expect(out.citations[0]?.href.startsWith("/training/")).toBe(true);
    expect(out.costMicroUsd).toBe(0);
    expect(callAiMock).not.toHaveBeenCalled();
  });

  it("still says it does not know when the training material has no match", async () => {
    const out = await askTrainingAssistantAction(
      "What is the boiling point of tungsten on Mars at sea level pressure?",
    );
    expect(out).toEqual({ ok: true, canAnswer: false, unansweredQuestionId: "unanswered-1" });
    expect(callAiMock).not.toHaveBeenCalled();
  });
});
