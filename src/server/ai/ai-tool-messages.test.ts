import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AI_CALL_TIMEOUT_MS,
  AI_SEQUENCE_DRAFTING_CALL_TIMEOUT_MS,
  callAiToolMessages,
} from "./ai-tool-messages";

const BASE_REQUEST = {
  apiKey: "xai-test",
  model: "grok-4-fast-non-reasoning",
  system: "system prompt",
  userText: "hello",
  maxTokens: 100,
  tool: { name: "t", description: "d", input_schema: {} },
};

function fakeXaiFetch() {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      choices: [
        {
          message: {
            tool_calls: [
              {
                type: "function",
                function: { name: "t", arguments: "{}" },
              },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 2, completion_tokens: 1 },
    }),
    text: async () => "",
  });
}

beforeEach(() => {
  delete process.env.AI_MODEL_PROVIDER;
  delete process.env.XAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
});

describe("callAiToolMessages", () => {
  it("calls xAI chat completions", async () => {
    const fetchImpl = fakeXaiFetch();
    await callAiToolMessages({ ...BASE_REQUEST, fetchImpl });
    expect(fetchImpl.mock.calls[0][0]).toBe("https://api.x.ai/v1/chat/completions");
  });

  it("calls xAI even when AI_MODEL_PROVIDER asks for anthropic — there is no second vendor", async () => {
    process.env.AI_MODEL_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const fetchImpl = fakeXaiFetch();
    await callAiToolMessages({ ...BASE_REQUEST, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe("https://api.x.ai/v1/chat/completions");
    expect(String(fetchImpl.mock.calls[0][0])).not.toContain("anthropic");
  });

  it("uses the default call timeout unless overridden", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const fetchImpl = fakeXaiFetch();

    await callAiToolMessages({ ...BASE_REQUEST, fetchImpl });
    expect(timeoutSpy).toHaveBeenCalledWith(AI_CALL_TIMEOUT_MS);

    timeoutSpy.mockClear();
    await callAiToolMessages({ ...BASE_REQUEST, fetchImpl, timeoutMs: AI_SEQUENCE_DRAFTING_CALL_TIMEOUT_MS });
    expect(timeoutSpy).toHaveBeenCalledWith(AI_SEQUENCE_DRAFTING_CALL_TIMEOUT_MS);

    timeoutSpy.mockRestore();
  });
});
