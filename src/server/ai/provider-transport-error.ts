import "server-only";

/**
 * Turn a thrown model-HTTP failure into a short reason safe to store and log.
 *
 * The staff banner stays a sentence. The run row and the usage ledger keep
 * this code, so the next soft fail says timeout, HTTP, parse, or network
 * without the API key or the request body.
 */

export type AiProviderFailureClass = "timeout" | "http" | "parse" | "network" | "other";

export function classifyAiProviderFailure(reason: string): AiProviderFailureClass {
  if (
    /_timeout\b/i.test(reason) ||
    /aborted due to timeout/i.test(reason) ||
    /\bTimeoutError\b/.test(reason)
  ) {
    return "timeout";
  }
  if (/^(?:anthropic|xai)_http_\d{3}\b/.test(reason) || /_unreadable_body\b/.test(reason)) {
    return "http";
  }
  if (
    /^xai_(?:missing_|no_tool|wrong_tool|tool_arguments)/.test(reason) ||
    reason === "unusable_answer"
  ) {
    return "parse";
  }
  if (/_network\b/.test(reason) || /_aborted\b/.test(reason) || /fetch failed/i.test(reason)) {
    return "network";
  }
  return "other";
}

export function sanitizeProviderErrorDetail(detail: string): string {
  const redacted = detail
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\b(?:sk-ant|xai|sk)-[A-Za-z0-9_-]{6,}\b/g, "[redacted]");
  return redacted.replace(/\s+/g, " ").trim().slice(0, 180);
}

export function isProviderTimeoutError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const name =
    "name" in err && typeof (err as { name: unknown }).name === "string"
      ? (err as { name: string }).name
      : "";
  if (name === "TimeoutError") return true;
  const message = err instanceof Error ? err.message : "";
  return /aborted due to timeout/i.test(message);
}

function errorName(err: unknown): string {
  if (typeof err !== "object" || err === null || !("name" in err)) return "";
  const name = (err as { name: unknown }).name;
  return typeof name === "string" ? name : "";
}

function networkCauseCode(err: unknown): string {
  if (!(err instanceof Error) || typeof err.cause !== "object" || err.cause === null) {
    return "";
  }
  if (!("code" in err.cause)) return "";
  const code = (err.cause as { code: unknown }).code;
  return typeof code === "string" && /^[A-Z0-9_]{1,40}$/.test(code) ? code : "";
}

/** Stable code for a fetch that never returned an HTTP response. */
export function providerTransportError(args: {
  vendor: "xai" | "anthropic";
  timeoutMs: number;
  err: unknown;
}): Error {
  if (isProviderTimeoutError(args.err)) {
    return new Error(`${args.vendor}_timeout: exceeded ${args.timeoutMs}ms`);
  }
  if (errorName(args.err) === "AbortError") {
    return new Error(`${args.vendor}_aborted`);
  }
  const message = args.err instanceof Error ? args.err.message : "fetch failed";
  const code = networkCauseCode(args.err);
  const detail = sanitizeProviderErrorDetail(
    [message, code].filter((part) => part.length > 0).join(" "),
  );
  return new Error(`${args.vendor}_network: ${detail || "fetch failed"}`);
}
