import { describe, expect, it, vi } from "vitest";

import { AI_CALL_TIMEOUT_MS, AI_SEQUENCE_DRAFTING_CALL_TIMEOUT_MS } from "./anthropic-messages";
import { callXaiChatCompletions } from "./xai-chat-completions";

const TOOL = {
  name: "record_answer",
  description: "Record structured output",
  input_schema: {
    type: "object",
    properties: { label: { type: "string" } },
    required: ["label"],
  },
};

describe("callXaiChatCompletions", () => {
  it("posts to the xAI chat completions endpoint with a forced tool", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              tool_calls: [
                {
                  type: "function",
                  function: {
                    name: "record_answer",
                    arguments: JSON.stringify({ label: "POSITIVE" }),
                  },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 12, completion_tokens: 3 },
      }),
      text: async () => "",
    });

    const response = await callXaiChatCompletions({
      apiKey: "xai-test",
      model: "grok-4-fast-non-reasoning",
      system: "system",
      userText: "user",
      maxTokens: 100,
      tool: TOOL,
      fetchImpl,
    });

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe("https://api.x.ai/v1/chat/completions");
    expect(init.headers.authorization).toBe("Bearer xai-test");
    const body = JSON.parse(String(init.body)) as { tool_choice: { function: { name: string } } };
    expect(body.tool_choice.function.name).toBe("record_answer");

    expect(response.inputTokens).toBe(12);
    expect(response.outputTokens).toBe(3);
    expect(response.content).toEqual([
      { type: "tool_use", name: "record_answer", input: { label: "POSITIVE" } },
    ]);
  });

  it("uses the default call timeout unless overridden", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              tool_calls: [
                {
                  type: "function",
                  function: { name: "record_answer", arguments: "{}" },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
      text: async () => "",
    });

    await callXaiChatCompletions({
      apiKey: "xai-test",
      model: "grok-4-fast-non-reasoning",
      system: "system",
      userText: "user",
      maxTokens: 100,
      tool: TOOL,
      fetchImpl,
    });
    expect(timeoutSpy).toHaveBeenCalledWith(AI_CALL_TIMEOUT_MS);

    timeoutSpy.mockClear();
    await callXaiChatCompletions({
      apiKey: "xai-test",
      model: "grok-4-fast-non-reasoning",
      system: "system",
      userText: "user",
      maxTokens: 100,
      tool: TOOL,
      fetchImpl,
      timeoutMs: AI_SEQUENCE_DRAFTING_CALL_TIMEOUT_MS,
    });
    expect(timeoutSpy).toHaveBeenCalledWith(AI_SEQUENCE_DRAFTING_CALL_TIMEOUT_MS);

    timeoutSpy.mockRestore();
  });
});
