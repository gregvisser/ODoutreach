import { describe, expect, it, vi } from "vitest";

import { callAnthropicMessages } from "./anthropic-messages";

function fakeFetch() {
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

describe("callAnthropicMessages — anthropic-workspace-id header", () => {
  it("omits the header when no workspace id is configured", async () => {
    const fetchImpl = fakeFetch();

    await callAnthropicMessages({ ...BASE_REQUEST, fetchImpl });

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(init.headers).not.toHaveProperty("anthropic-workspace-id");
  });

  it("sends the header when a workspace id is configured", async () => {
    const fetchImpl = fakeFetch();

    await callAnthropicMessages({
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
