import "server-only";

import {
  callAnthropicMessages,
  type AnthropicMessagesResponse,
  type AnthropicToolDefinition,
} from "./anthropic-messages";
import { resolveProductAiProvider } from "./ai-provider";
import { callXaiChatCompletions } from "./xai-chat-completions";

export type AiToolDefinition = AnthropicToolDefinition;

export interface AiToolMessagesRequest {
  readonly apiKey: string;
  readonly model: string;
  readonly system: string;
  readonly userText: string;
  readonly maxTokens: number;
  readonly tool: AiToolDefinition;
  readonly workspaceId?: string;
  readonly fetchImpl?: typeof fetch;
}

export type AiToolMessagesResponse = AnthropicMessagesResponse;

/**
 * Forced-tool model call for product AI features.
 *
 * Dispatches to xAI or Anthropic based on `resolveProductAiProvider()`.
 * Response `content` is always Anthropic-shaped (`tool_use` blocks) so
 * existing parsers stay unchanged.
 */
export async function callAiToolMessages(
  req: AiToolMessagesRequest,
): Promise<AiToolMessagesResponse> {
  const provider = resolveProductAiProvider();
  if (provider === "xai") {
    return callXaiChatCompletions({
      apiKey: req.apiKey,
      model: req.model,
      system: req.system,
      userText: req.userText,
      maxTokens: req.maxTokens,
      tool: req.tool,
      fetchImpl: req.fetchImpl,
    });
  }
  return callAnthropicMessages({
    apiKey: req.apiKey,
    model: req.model,
    system: req.system,
    userText: req.userText,
    maxTokens: req.maxTokens,
    tool: req.tool,
    workspaceId: req.workspaceId,
    fetchImpl: req.fetchImpl,
  });
}
