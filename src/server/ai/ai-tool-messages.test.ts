import { beforeEach, describe, expect, it, vi } from "vitest";

import { callAiToolMessages } from "./ai-tool-messages";

const TOOL = { name: "t", description: "d", input_schema: { type: "object" } };

function fakeAnthropicFetch() {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      content: [{ type: "tool_use", name: "t", input: {} }],
      usage: { input_tokens: 1, output_tokens: 1 },
    }),
    text: async () => "",
  });
}

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
  it("uses Anthropic when provider is anthropic", async () => {
    process.env.AI_MODEL_PROVIDER = "anthropic";
    const fetchImpl = fakeAnthropicFetch();

    await callAiToolMessages({
      apiKey: "ant",
      model: "claude-x",
      system: "s",
      userText: "u",
      maxTokens: 10,
      tool: TOOL,
      fetchImpl,
    });

    expect(fetchImpl.mock.calls[0][0]).toBe("https://api.anthropic.com/v1/messages");
  });

  it("uses xAI when provider is xai", async () => {
    process.env.AI_MODEL_PROVIDER = "xai";
    const fetchImpl = fakeXaiFetch();

    await callAiToolMessages({
      apiKey: "xai",
      model: "grok-4-fast-non-reasoning",
      system: "s",
      userText: "u",
      maxTokens: 10,
      tool: TOOL,
      fetchImpl,
    });

    expect(fetchImpl.mock.calls[0][0]).toBe("https://api.x.ai/v1/chat/completions");
  });
});
