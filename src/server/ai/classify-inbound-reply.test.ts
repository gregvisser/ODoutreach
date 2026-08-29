import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, callAnthropicMock } = vi.hoisted(() => ({
  prismaMock: {
    inboundReply: { findFirst: vi.fn(), update: vi.fn() },
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

import { CLASSIFICATION_TOOL } from "@/lib/ai/reply-classification";

import { classifyInboundReply } from "./classify-inbound-reply";

const REPLY = {
  id: "reply-1",
  clientId: "client-1",
  subject: "Re: quick question",
  bodyPreview: "Yes, happy to talk. How is Thursday?",
  snippet: null,
  classification: null,
  client: { id: "client-1", slug: "train-hugger" },
};

function modelAnswers(input: unknown, usage = { inputTokens: 700, outputTokens: 40 }) {
  callAnthropicMock.mockResolvedValue({
    content: [{ type: "tool_use", name: CLASSIFICATION_TOOL.name, input }],
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  });
}

/** The data written back onto the reply row. */
function savedClassification() {
  expect(prismaMock.inboundReply.update).toHaveBeenCalledTimes(1);
  return prismaMock.inboundReply.update.mock.calls[0][0].data;
}

beforeEach(() => {
  prismaMock.inboundReply.findFirst.mockReset().mockResolvedValue(REPLY);
  prismaMock.inboundReply.update.mockReset().mockResolvedValue({});
  prismaMock.aiUsageEvent.create.mockReset().mockResolvedValue({ id: "usage-1" });
  callAnthropicMock.mockReset();
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  delete process.env.AI_FEATURES;
});

describe("classifying a reply", () => {
  it("labels a warm reply and saves it against the reply", async () => {
    modelAnswers({ label: "POSITIVE", confidence: 95, rationale: "Offered a time." });

    const out = await classifyInboundReply({ replyId: "reply-1" });

    expect(out.classified).toBe(true);
    const data = savedClassification();
    expect(data.classification).toBe("POSITIVE");
    expect(data.classificationConfidence).toBe(95);
    expect(data.classificationRationale).toBe("Offered a time.");
    expect(data.classifiedAt).toBeInstanceOf(Date);
    expect(data.classificationModel).toMatch(/^claude-/);
  });

  it("meters the call against the client that received the reply", async () => {
    modelAnswers({ label: "POSITIVE", confidence: 95, rationale: "x" });

    await classifyInboundReply({ replyId: "reply-1" });

    expect(prismaMock.aiUsageEvent.create).toHaveBeenCalledTimes(1);
    const row = prismaMock.aiUsageEvent.create.mock.calls[0][0].data;
    expect(row.clientId).toBe("client-1");
    expect(row.clientSlugAtCall).toBe("train-hugger");
    expect(row.feature).toBe("REPLY_CLASSIFICATION");
    expect(row.subjectId).toBe("reply-1");
    expect(row.costMicroUsd).toBe(900);
  });

  it("sends the reply body to the model", async () => {
    modelAnswers({ label: "POSITIVE", confidence: 95, rationale: "x" });

    await classifyInboundReply({ replyId: "reply-1" });

    const sent = callAnthropicMock.mock.calls[0][0];
    expect(sent.userText).toMatch(/Yes, happy to talk/);
    expect(sent.userText).toMatch(/Re: quick question/);
    // Forced tool call — prose answers are not an accepted output shape.
    expect(sent.tool.name).toBe(CLASSIFICATION_TOOL.name);
  });
});

describe("when it cannot classify, the reply is left for a person", () => {
  it("saves nothing when the model returns an unusable answer", async () => {
    modelAnswers({ label: "DEFINITELY_MAYBE", confidence: 99, rationale: "x" });

    const out = await classifyInboundReply({ replyId: "reply-1" });

    expect(out.classified).toBe(false);
    expect(prismaMock.inboundReply.update).not.toHaveBeenCalled();
  });

  it("saves nothing, and does not throw, when the model call fails", async () => {
    callAnthropicMock.mockRejectedValue(new Error("anthropic_http_529: overloaded"));

    const out = await classifyInboundReply({ replyId: "reply-1" });

    expect(out.classified).toBe(false);
    expect(prismaMock.inboundReply.update).not.toHaveBeenCalled();
    // The failure is still on the ledger.
    expect(prismaMock.aiUsageEvent.create.mock.calls[0][0].data.status).toBe("ERROR");
  });

  it("does not call the model at all when the AI switch is off", async () => {
    process.env.AI_FEATURES = "off";

    const out = await classifyInboundReply({ replyId: "reply-1" });

    expect(out.classified).toBe(false);
    expect(callAnthropicMock).not.toHaveBeenCalled();
    expect(prismaMock.inboundReply.update).not.toHaveBeenCalled();
  });

  it("does not call the model when no API key is set, and does not invent a label", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const out = await classifyInboundReply({ replyId: "reply-1" });

    expect(out.classified).toBe(false);
    expect(callAnthropicMock).not.toHaveBeenCalled();
    expect(prismaMock.inboundReply.update).not.toHaveBeenCalled();
  });
});

describe("guards", () => {
  it("does nothing when the reply does not exist", async () => {
    prismaMock.inboundReply.findFirst.mockResolvedValue(null);

    const out = await classifyInboundReply({ replyId: "missing" });

    expect(out.classified).toBe(false);
    expect(callAnthropicMock).not.toHaveBeenCalled();
    // No client to bill, so nothing may be charged.
    expect(prismaMock.aiUsageEvent.create).not.toHaveBeenCalled();
  });

  it("does not re-classify and re-charge a reply that already has a label", async () => {
    prismaMock.inboundReply.findFirst.mockResolvedValue({
      ...REPLY,
      classification: "POSITIVE",
    });

    const out = await classifyInboundReply({ replyId: "reply-1" });

    expect(out.classified).toBe(false);
    expect(callAnthropicMock).not.toHaveBeenCalled();
    expect(prismaMock.aiUsageEvent.create).not.toHaveBeenCalled();
  });

  it("falls back to the snippet when there is no body preview", async () => {
    prismaMock.inboundReply.findFirst.mockResolvedValue({
      ...REPLY,
      bodyPreview: null,
      snippet: "Please remove me from your list",
    });
    modelAnswers({ label: "UNSUBSCRIBE", confidence: 99, rationale: "Asked to be removed." });

    await classifyInboundReply({ replyId: "reply-1" });

    expect(callAnthropicMock.mock.calls[0][0].userText).toMatch(/Please remove me/);
  });
});
