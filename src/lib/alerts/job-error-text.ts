/**
 * Text safe to print in a GitHub Actions log or an HTTP job body.
 * Strips mailbox secrets and prospect addresses. Keeps the failure sentence.
 */

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const SECRET_PATTERN =
  /Bearer\s+\S+|postgres(?:ql)?:\/\/\S+|\b(?:sk-ant|xai|sk)-[A-Za-z0-9_-]{6,}\b/gi;

export function sanitizeJobErrorText(raw: string): string {
  const cleaned = raw
    .replace(SECRET_PATTERN, "[redacted]")
    .replace(EMAIL_PATTERN, "[redacted-email]")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 300);
}

/** Up to ten sanitized reasons from a scheduled-outreach JSON body. */
export function jobErrorLines(body: unknown): string[] {
  if (!body || typeof body !== "object" || Array.isArray(body)) return [];
  const record = body as Record<string, unknown>;
  const lines: string[] = [];
  if (Array.isArray(record.errors)) {
    for (const entry of record.errors) {
      if (typeof entry === "string" && entry.trim()) lines.push(sanitizeJobErrorText(entry));
    }
  }
  if (typeof record.error === "string" && record.error.trim()) {
    lines.push(sanitizeJobErrorText(record.error));
  }
  if (Array.isArray(record.skippedSteps)) {
    for (const entry of record.skippedSteps) {
      if (typeof entry === "string" && entry.trim()) {
        lines.push(`skipped: ${sanitizeJobErrorText(entry)}`);
      }
    }
  }
  return lines.slice(0, 10);
}
