import "server-only";

const DEFAULT_MAX = 5;

export function maxOutboundSendRetries(): number {
  const raw = process.env.MAX_OUTBOUND_SEND_RETRIES?.trim();
  const n = raw ? parseInt(raw, 10) : DEFAULT_MAX;
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_MAX;
}

/** HTTP-style codes from provider (e.g. Resend) or synthetic transport errors. */
export function isRetryableSendFailure(code?: string, message?: string): boolean {
  if (!code && !message) return false;
  const c = code?.trim();
  if (c === "429" || c === "408" || c === "503" || c === "502" || c === "504") {
    return true;
  }
  // The recipient-verification gate could not reach a resolver. That is a fact
  // about DNS, not about the recipient, so the row goes back on the queue
  // rather than being failed — the whole point of the gate's "defer" verdict.
  if (c === "RECIPIENT_VERIFICATION_UNAVAILABLE") {
    return true;
  }
  const m = (message ?? "").toLowerCase();
  if (
    m.includes("timeout") ||
    m.includes("timed out") ||
    m.includes("econnreset") ||
    m.includes("socket") ||
    m.includes("rate limit")
  ) {
    return true;
  }
  return false;
}

export function computeNextRetryAt(retryCount: number, from: Date = new Date()): Date {
  const baseMs = 15_000;
  const capMs = 15 * 60_000;
  const delay = Math.min(baseMs * 2 ** Math.min(retryCount, 10), capMs);
  return new Date(from.getTime() + delay);
}
