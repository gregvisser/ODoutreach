import "server-only";

/**
 * A minimal Anthropic Messages API client, built on `fetch`.
 *
 * WHY NO SDK. The engineering standard says stdlib before a dependency, and
 * this is one HTTPS POST with a JSON body. `@anthropic-ai/sdk` would add a
 * dependency, a version to keep current and a supply-chain surface to a call
 * the platform already makes natively — the same reasoning that has this
 * codebase talking to Microsoft Graph and Gmail over plain `fetch`.
 *
 * What this file is NOT: it is not a place to add retries, batching or
 * streaming without deciding deliberately. In particular a naive retry would
 * double-charge the client, because a call that times out may well have been
 * served and billed.
 */

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";

/** Pinned. A version bump changes response shapes, so it is a deliberate edit. */
const ANTHROPIC_VERSION = "2023-06-01";

/**
 * How long we will wait for the model.
 *
 * Classification runs inline in reply ingestion, so this is the longest a
 * single reply can be delayed by the AI being slow. A hung call must fail and
 * leave the reply unclassified — which routes it to a human, the correct
 * fallback — rather than hold up the rest of the sync.
 */
export const AI_CALL_TIMEOUT_MS = 20_000;

export interface AnthropicToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly input_schema: Readonly<Record<string, unknown>>;
}

export interface AnthropicMessagesRequest {
  readonly apiKey: string;
  readonly model: string;
  readonly system: string;
  readonly userText: string;
  readonly maxTokens: number;
  /** When set, the model is forced to answer by calling this tool. */
  readonly tool: AnthropicToolDefinition;
  /** Injectable for tests. Defaults to the platform `fetch`. */
  readonly fetchImpl?: typeof fetch;
}

export interface AnthropicMessagesResponse {
  /** Raw content blocks — handed to a feature-specific parser. */
  readonly content: unknown;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

/** Read a token count defensively; a missing count must bill as 0, not NaN. */
function tokenCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : 0;
}

/**
 * Send one message and return its content blocks plus token usage.
 *
 * Throws on any non-2xx or unreadable response. The caller is always
 * `runMeteredAiCall`, which turns a throw into a recorded ERROR row — so a
 * failure here is metered, not lost.
 */
export async function callAnthropicMessages(
  req: AnthropicMessagesRequest,
): Promise<AnthropicMessagesResponse> {
  const doFetch = req.fetchImpl ?? fetch;

  const response = await doFetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": req.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: req.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: [{ role: "user", content: req.userText }],
      tools: [req.tool],
      tool_choice: { type: "tool", name: req.tool.name },
    }),
    signal: AbortSignal.timeout(AI_CALL_TIMEOUT_MS),
  });

  if (!response.ok) {
    // The body often carries the real reason (rate limit, bad key, overloaded).
    // Bounded because it lands in an `outcomeCode` column.
    const detail = await response.text().catch(() => "");
    throw new Error(`anthropic_http_${response.status}: ${detail.slice(0, 300)}`);
  }

  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null) {
    throw new Error("anthropic_unreadable_body");
  }
  const record = body as { content?: unknown; usage?: unknown };
  const usage = (record.usage ?? {}) as { input_tokens?: unknown; output_tokens?: unknown };

  return {
    content: record.content,
    inputTokens: tokenCount(usage.input_tokens),
    outputTokens: tokenCount(usage.output_tokens),
  };
}
