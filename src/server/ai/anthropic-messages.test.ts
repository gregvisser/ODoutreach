import { beforeEach, describe, expect, it, vi } from "vitest";

import { callAiToolMessages, postAnthropicMessages } from "./anthropic-messages";

function fakeAnthropicFetch() {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ content: [], usage: { input_tokens: 1, output_tokens: 1 } }),
    text: async () => "",
  });
}

const BASE_REQUEST = {
  apiKey: "sk-ant-test",
  model: "claude-x",
  system: "system prompt",
  userText: "hello",
  maxTokens: 100,
  tool: { name: "t", description: "d", input_schema: {} },
};

describe("postAnthropicMessages — anthropic-workspace-id header", () => {
  it("omits the header when no workspace id is configured", async () => {
    const fetchImpl = fakeAnthropicFetch();

    await postAnthropicMessages({ ...BASE_REQUEST, fetchImpl });

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(init.headers).not.toHaveProperty("anthropic-workspace-id");
  });

  it("sends the header when a workspace id is configured", async () => {
    const fetchImpl = fakeAnthropicFetch();

    await postAnthropicMessages({
      ...BASE_REQUEST,
      workspaceId: "wrkspc_01Nd6QgCKXdPbyFHV4regqTJ",
      fetchImpl,
    });

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(init.headers).toMatchObject({
      "anthropic-workspace-id": "wrkspc_01Nd6QgCKXdPbyFHV4regqTJ",
    });
  });
});

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

describe("callAiToolMessages — provider dispatch", () => {
  it("uses Anthropic when provider is anthropic", async () => {
    process.env.AI_MODEL_PROVIDER = "anthropic";
    const fetchImpl = fakeAnthropicFetch();

    await callAiToolMessages({
      ...BASE_REQUEST,
      fetchImpl,
    });

    expect(fetchImpl.mock.calls[0][0]).toBe("https://api.anthropic.com/v1/messages");
  });

  it("uses xAI when provider is xai", async () => {
    process.env.AI_MODEL_PROVIDER = "xai";
    const fetchImpl = fakeXaiFetch();

    await callAiToolMessages({
      ...BASE_REQUEST,
      model: "grok-4-fast-non-reasoning",
      fetchImpl,
    });

    expect(fetchImpl.mock.calls[0][0]).toBe("https://api.x.ai/v1/chat/completions");
  });
});
