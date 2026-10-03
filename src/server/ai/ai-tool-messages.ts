import "server-only";

import type { XaiReasoningEffort } from "@/lib/ai/sequence-draft-timing";

import { callXaiChatCompletions } from "./xai-chat-completions";

/**
 * Product AI HTTP choke point.
 *
 * `callAiToolMessages` is what every feature calls. Product AI is xAI (Grok)
 * only, so it goes straight to `api.x.ai/v1` via `xai-chat-completions.ts`.
 * Parsers receive `tool_use`-shaped content blocks from that adapter.
 *
 * WHY NO SDK. Stdlib `fetch` only; same reasoning as Graph/Gmail in this app.
 * No naive retries — a timeout may already have been billed.
 */

/**
 * How long we will wait for the model.
 *
 * Classification runs inline in reply ingestion, so this is the longest a
 * single reply can be delayed by the AI being slow. A hung call must fail and
 * leave the reply unclassified — which routes it to a human, the correct
 * fallback — rather than hold up the rest of the sync.
 */
export const AI_CALL_TIMEOUT_MS = 20_000;

/**
 * Sequence-draft model budget. Defined in `sequence-draft-timing.ts` so the
 * run deadline and the browser poll share one number. Reply classification
 * keeps {@link AI_CALL_TIMEOUT_MS}.
 */
export { AI_SEQUENCE_DRAFTING_CALL_TIMEOUT_MS } from "@/lib/ai/sequence-draft-timing";

export interface AiToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly input_schema: Readonly<Record<string, unknown>>;
}

export interface AiToolMessagesRequest {
  readonly apiKey: string;
  readonly model: string;
  readonly system: string;
  readonly userText: string;
  readonly maxTokens: number;
  /** The model is forced to answer by calling this tool. */
  readonly tool: AiToolDefinition;
  /** Injectable for tests. Defaults to the platform `fetch`. */
  readonly fetchImpl?: typeof fetch;
  /** Per-call override; defaults to {@link AI_CALL_TIMEOUT_MS}. */
  readonly timeoutMs?: number;
  /** Sequence drafting sets `low` for grok models whose default effort is `high`. */
  readonly reasoningEffort?: XaiReasoningEffort;
}

export interface AiToolMessagesResponse {
  /** Raw content blocks — handed to a feature-specific parser. */
  readonly content: unknown;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

/**
 * Forced-tool model call — the only entry from product AI feature modules.
 *
 * Throws on any non-2xx or unreadable response. The caller is always
 * `runMeteredAiCall`, which turns a throw into a recorded ERROR row — so a
 * failure here is metered, not lost.
 */
export async function callAiToolMessages(
  req: AiToolMessagesRequest,
): Promise<AiToolMessagesResponse> {
  return callXaiChatCompletions({
    apiKey: req.apiKey,
    model: req.model,
    system: req.system,
    userText: req.userText,
    maxTokens: req.maxTokens,
    tool: req.tool,
    fetchImpl: req.fetchImpl,
    timeoutMs: req.timeoutMs,
    reasoningEffort: req.reasoningEffort,
  });
}
