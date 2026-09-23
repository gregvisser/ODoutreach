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
    const body = JSON.parse(String(init.body)) as {
      tool_choice: { function: { name: string } };
      reasoning_effort?: string;
    };
    expect(body.tool_choice.function.name).toBe("record_answer");
    expect(body).not.toHaveProperty("reasoning_effort");

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

  it("sends reasoning_effort only when the caller sets it", async () => {
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
      model: "grok-4.7",
      system: "system",
      userText: "user",
      maxTokens: 100,
      tool: TOOL,
      fetchImpl,
      reasoningEffort: "low",
    });

    const body = JSON.parse(String((fetchImpl.mock.calls[0] as [string, RequestInit])[1].body)) as {
      reasoning_effort?: string;
    };
    expect(body.reasoning_effort).toBe("low");
  });

  it("records a client timeout as xai_timeout and an HTTP error without the key", async () => {
    const timedOut = vi.fn().mockRejectedValue(
      new DOMException("The operation was aborted due to timeout", "TimeoutError"),
    );
    await expect(
      callXaiChatCompletions({
        apiKey: "xai-supersecretvalue",
        model: "grok-4.7",
        system: "system",
        userText: "user",
        maxTokens: 100,
        tool: TOOL,
        fetchImpl: timedOut,
        timeoutMs: AI_SEQUENCE_DRAFTING_CALL_TIMEOUT_MS,
      }),
    ).rejects.toThrow("xai_timeout: exceeded 180000ms");

    const httpError = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "invalid Bearer xai-supersecretvalue",
      json: async () => ({}),
    });
    await expect(
      callXaiChatCompletions({
        apiKey: "xai-supersecretvalue",
        model: "grok-4.7",
        system: "system",
        userText: "user",
        maxTokens: 100,
        tool: TOOL,
        fetchImpl: httpError,
      }),
    ).rejects.toThrow(/xai_http_401:/);
    await expect(
      callXaiChatCompletions({
        apiKey: "xai-supersecretvalue",
        model: "grok-4.7",
        system: "system",
        userText: "user",
        maxTokens: 100,
        tool: TOOL,
        fetchImpl: httpError,
      }),
    ).rejects.not.toThrow(/supersecret/);
  });

  it("keeps a missing tool call as a parse code", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "no tool" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
      text: async () => "",
    });

    await expect(
      callXaiChatCompletions({
        apiKey: "xai-test",
        model: "grok-4.7",
        system: "system",
        userText: "user",
        maxTokens: 100,
        tool: TOOL,
        fetchImpl,
      }),
    ).rejects.toThrow("xai_missing_tool_calls");
  });
});
