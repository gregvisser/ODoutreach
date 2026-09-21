import "server-only";

import { AI_CALL_TIMEOUT_MS } from "./anthropic-messages";

const XAI_CHAT_COMPLETIONS_URL = "https://api.x.ai/v1/chat/completions";

export interface XaiToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly input_schema: Readonly<Record<string, unknown>>;
}

export interface XaiChatCompletionsRequest {
  readonly apiKey: string;
  readonly model: string;
  readonly system: string;
  readonly userText: string;
  readonly maxTokens: number;
  readonly tool: XaiToolDefinition;
  readonly fetchImpl?: typeof fetch;
}

export interface XaiChatCompletionsResponse {
  /** Anthropic-shaped content blocks for existing parsers. */
  readonly content: unknown;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

function tokenCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : 0;
}

/** Normalize OpenAI tool-call output to Anthropic `tool_use` blocks. */
function contentFromOpenAiBody(body: unknown, expectedToolName: string): unknown {
  if (typeof body !== "object" || body === null) {
    throw new Error("xai_unreadable_body");
  }
  const record = body as {
    choices?: unknown;
  };
  const choices = record.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error("xai_missing_choices");
  }
  const first = choices[0];
  if (typeof first !== "object" || first === null) {
    throw new Error("xai_missing_message");
  }
  const message = (first as { message?: unknown }).message;
  if (typeof message !== "object" || message === null) {
    throw new Error("xai_missing_message");
  }
  const toolCalls = (message as { tool_calls?: unknown }).tool_calls;
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
    throw new Error("xai_missing_tool_calls");
  }

  const blocks: Array<{ type: string; name: string; input: unknown }> = [];
  for (const call of toolCalls) {
    if (typeof call !== "object" || call === null) continue;
    const fn = (call as { function?: unknown }).function;
    if (typeof fn !== "object" || fn === null) continue;
    const name = (fn as { name?: unknown }).name;
    const argsRaw = (fn as { arguments?: unknown }).arguments;
    if (typeof name !== "string") continue;
    let input: unknown;
    if (typeof argsRaw === "string") {
      try {
        input = JSON.parse(argsRaw) as unknown;
      } catch {
        throw new Error("xai_tool_arguments_not_json");
      }
    } else if (typeof argsRaw === "object" && argsRaw !== null) {
      input = argsRaw;
    } else {
      throw new Error("xai_tool_arguments_missing");
    }
    blocks.push({ type: "tool_use", name, input });
  }

  if (blocks.length === 0) {
    throw new Error("xai_no_tool_use_blocks");
  }
  const named = blocks.find((b) => b.name === expectedToolName);
  if (!named) {
    throw new Error("xai_wrong_tool_name");
  }
  return blocks;
}

/**
 * One forced-tool chat completion against xAI's OpenAI-compatible API.
 */
export async function callXaiChatCompletions(
  req: XaiChatCompletionsRequest,
): Promise<XaiChatCompletionsResponse> {
  const doFetch = req.fetchImpl ?? fetch;

  const response = await doFetch(XAI_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${req.apiKey}`,
    },
    body: JSON.stringify({
      model: req.model,
      max_tokens: req.maxTokens,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.userText },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: req.tool.name,
            description: req.tool.description,
            parameters: req.tool.input_schema,
          },
        },
      ],
      tool_choice: {
        type: "function",
        function: { name: req.tool.name },
      },
    }),
    signal: AbortSignal.timeout(AI_CALL_TIMEOUT_MS),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`xai_http_${response.status}: ${detail.slice(0, 300)}`);
  }

  const body: unknown = await response.json();
  const content = contentFromOpenAiBody(body, req.tool.name);

  let usage: { prompt_tokens?: unknown; completion_tokens?: unknown } = {};
  if (typeof body === "object" && body !== null) {
    usage = ((body as { usage?: unknown }).usage ?? {}) as {
      prompt_tokens?: unknown;
      completion_tokens?: unknown;
    };
  }

  return {
    content,
    inputTokens: tokenCount(usage.prompt_tokens),
    outputTokens: tokenCount(usage.completion_tokens),
  };
}
