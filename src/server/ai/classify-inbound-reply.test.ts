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

beforeEach(() => {
  prismaMock.inboundReply.findFirst.mockReset().mockResolvedValue(REPLY);
  prismaMock.inboundReply.update.mockReset().mockResolvedValue({});
  prismaMock.aiUsageEvent.create.mockReset().mockResolvedValue({ id: "usage-1" });
  callAnthropicMock.mockReset();
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  delete process.env.AI_FEATURES;
});

describe("the personal-data processor gate (CR-10)", () => {
  // Reply classification is the one feature this codebase has declared to
  // carry a prospect's own words (subject + body, verbatim) to Anthropic, and
  // Anthropic carries no recorded processor allowance for that. So — with a
  // real API key configured (see `beforeEach`) — this must refuse before the
  // model is ever called, not merely when the key happens to be absent.
  it("refuses to classify — and never calls Anthropic — even though a valid API key is configured", async () => {
    modelAnswers({ label: "POSITIVE", confidence: 95, rationale: "Offered a time." });

    const out = await classifyInboundReply({ replyId: "reply-1" });

    expect(out.classified).toBe(false);
    expect(out.reason).toBe("no_processor_allowance");
    expect(callAnthropicMock).not.toHaveBeenCalled();
    expect(prismaMock.inboundReply.update).not.toHaveBeenCalled();
  });

  it("still records the refusal on the usage ledger, against the client that received the reply", async () => {
    modelAnswers({ label: "POSITIVE", confidence: 95, rationale: "x" });

    await classifyInboundReply({ replyId: "reply-1" });

    expect(prismaMock.aiUsageEvent.create).toHaveBeenCalledTimes(1);
    const row = prismaMock.aiUsageEvent.create.mock.calls[0][0].data;
    expect(row.status).toBe("REFUSED");
    expect(row.outcomeCode).toBe("no_processor_allowance");
    expect(row.costMicroUsd).toBe(0);
    expect(row.clientId).toBe("client-1");
    expect(row.clientSlugAtCall).toBe("train-hugger");
    expect(row.feature).toBe("REPLY_CLASSIFICATION");
    expect(row.subjectId).toBe("reply-1");
  });
});

describe("when it cannot classify, the reply is left for a person", () => {
  // The "model returns an unusable answer" and "model call fails" branches of
  // classifyInboundReply (an unparseable tool call; a thrown error inside
  // `invoke`) are exercised by `reply-classification.test.ts` and
  // `metered-call.test.ts` respectively, but cannot be reached THROUGH this
  // function today: the CR-10 gate above refuses REPLY_CLASSIFICATION before
  // `invoke` ever runs, for any input, regardless of what the model would have
  // said. That is a deliberate, temporary loss of integration coverage on this
  // one file, not an oversight — restoring it is exactly the work of whatever
  // future row grants Anthropic a recorded processor allowance.

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
});
